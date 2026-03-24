#!/usr/bin/env python3
"""
Registra webhook Pix na Efí via API (PUT /v2/webhook/:chave) com skip-mTLS no cadastro.

Requer certificado cliente (mesmo .p12 da aplicação, convertido para PEM) + client_id/secret da API Pix.

Uso:
  python scripts/register-pix-webhook.py --env homolog \\
    --chave SUA_CHAVE_PIX_UUID \\
    --p12 "C:\\caminho\\homologacao.p12" \\
    --client-id ... --client-secret ...

Ou com PEM:
  python scripts/register-pix-webhook.py --env homolog --chave UUID \\
    --cert cert.pem --key key.pem --client-id ... --client-secret ...

URL sugerida na Vercel (ajuste hmac ao seu EFI_WEBHOOK_HMAC):
  https://contas-efi.vercel.app/api/pix-webhook-proxy?hmac=SEU_HMAC&ignorar=

Doc: https://dev.efipay.com.br/docs/api-pix/webhooks
"""
from __future__ import annotations

import argparse
import base64
import json
import ssl
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


BASE_URL = {
    "homolog": "https://pix-h.api.efipay.com.br",
    "production": "https://pix.api.efipay.com.br",
}


def p12_to_pem_files(p12_path: Path, password: bytes) -> tuple[Path, Path]:
    from cryptography.hazmat.primitives.serialization import (
        Encoding,
        NoEncryption,
        PrivateFormat,
        pkcs12,
    )

    data = p12_path.read_bytes()
    key, cert, _ = pkcs12.load_key_and_certificates(data, password)
    if cert is None or key is None:
        raise SystemExit("P12 sem certificado ou chave privada.")

    d = tempfile.mkdtemp(prefix="efi-pix-")
    cert_path = Path(d) / "cert.pem"
    key_path = Path(d) / "key.pem"
    cert_path.write_bytes(cert.public_bytes(Encoding.PEM))
    key_path.write_bytes(
        key.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption())
    )
    return cert_path, key_path


def ssl_context_with_cert(cert_file: str, key_file: str) -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    ctx.load_cert_chain(cert_file, key_file)
    return ctx


def request_json(
    url: str,
    method: str,
    body: dict | None,
    headers: dict[str, str],
    cert_file: str,
    key_file: str,
) -> tuple[int, str]:
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method)
    for k, v in headers.items():
        req.add_header(k, v)
    ctx = ssl_context_with_cert(cert_file, key_file)
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=60) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")


def main() -> None:
    p = argparse.ArgumentParser(description="PUT /v2/webhook/:chave (Pix) com skip-mTLS")
    p.add_argument("--env", choices=("homolog", "production"), required=True)
    p.add_argument("--chave", required=True, help="Chave Pix (UUID) — path param da API")
    p.add_argument(
        "--webhook-url",
        default="https://contas-efi.vercel.app/api/pix-webhook-proxy?hmac=webhook&ignorar=",
        help="URL HTTPS cadastrada (use o mesmo hmac que EFI_WEBHOOK_HMAC na Vercel)",
    )
    p.add_argument("--client-id", required=True)
    p.add_argument("--client-secret", required=True)
    p.add_argument("--p12", help="Caminho do .p12 (alternativa a --cert/--key)")
    p.add_argument("--p12-password", default="", help="Senha do P12 (vazio se não tiver)")
    p.add_argument("--cert", help="cert.pem")
    p.add_argument("--key", help="key.pem")
    args = p.parse_args()

    base = BASE_URL[args.env]
    if args.p12:
        cert_path, key_path = p12_to_pem_files(
            Path(args.p12), args.p12_password.encode("utf-8")
        )
        cert_file, key_file = str(cert_path), str(key_path)
    elif args.cert and args.key:
        cert_file, key_file = args.cert, args.key
    else:
        raise SystemExit("Informe --p12 ou (--cert e --key).")

    basic = base64.b64encode(
        f"{args.client_id}:{args.client_secret}".encode("utf-8")
    ).decode("ascii")

    status, text = request_json(
        f"{base}/oauth/token",
        "POST",
        {"grant_type": "client_credentials"},
        {
            "Authorization": f"Basic {basic}",
            "Content-Type": "application/json",
        },
        cert_file,
        key_file,
    )
    if status != 200:
        print("OAuth falhou:", status, text)
        raise SystemExit(1)
    token = json.loads(text).get("access_token")
    if not token:
        print("OAuth sem access_token:", text)
        raise SystemExit(1)

    chave_enc = urllib.parse.quote(args.chave, safe="")
    status, text = request_json(
        f"{base}/v2/webhook/{chave_enc}",
        "PUT",
        {"webhookUrl": args.webhook_url},
        {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "x-skip-mtls-checking": "true",
        },
        cert_file,
        key_file,
    )
    print("PUT /v2/webhook:", status)
    print(text)


if __name__ == "__main__":
    main()
