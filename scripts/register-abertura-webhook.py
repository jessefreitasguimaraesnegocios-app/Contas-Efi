#!/usr/bin/env python3
"""
Cadastra webhook da API Abertura de Contas na Efí: POST /v1/webhook

Requer mTLS (certificado da aplicação integradora) + client_id/client_secret com escopo
gn.registration.webhook.write.

Uso:
  python scripts/register-abertura-webhook.py --env homolog \\
    --p12 "C:\\...\\homologacao.p12" \\
    --client-id ... --client-secret ... \\
    --webhook-url "https://contas-efi.vercel.app/api/efi-registration-webhook-proxy?hmac=SEU_HMAC"

Doc: https://dev.efipay.com.br/docs/api-abertura-de-contas/webhook
"""
from __future__ import annotations

import argparse
import base64
import json
import ssl
import tempfile
import urllib.error
import urllib.request
from pathlib import Path


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

    d = tempfile.mkdtemp(prefix="efi-abertura-")
    cert_path = Path(d) / "cert.pem"
    key_path = Path(d) / "key.pem"
    cert_path.write_bytes(cert.public_bytes(Encoding.PEM))
    key_path.write_bytes(
        key.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption())
    )
    return cert_path, key_path


BASE_URL = {
    "homolog": "https://abrircontas-h.api.efipay.com.br",
    "production": "https://abrircontas.api.efipay.com.br",
}


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
    p = argparse.ArgumentParser(description="POST /v1/webhook (Abertura de Contas)")
    p.add_argument("--env", choices=("homolog", "production"), required=True)
    p.add_argument(
        "--webhook-url",
        default="https://contas-efi.vercel.app/api/efi-registration-webhook-proxy?hmac=webhook",
        help="URL pública HTTPS (proxy Vercel + mesmo hmac que EFI_WEBHOOK_HMAC)",
    )
    p.add_argument("--client-id", required=True)
    p.add_argument("--client-secret", required=True)
    p.add_argument("--p12", help="Caminho do .p12")
    p.add_argument("--p12-password", default="")
    p.add_argument("--cert")
    p.add_argument("--key")
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

    status, text = request_json(
        f"{base}/v1/webhook",
        "POST",
        {"webhookUrl": args.webhook_url},
        {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        cert_file,
        key_file,
    )
    print("POST /v1/webhook:", status)
    print(text)


if __name__ == "__main__":
    main()
