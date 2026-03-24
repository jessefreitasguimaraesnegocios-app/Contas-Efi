"""Gera docs/vercel-efi-env-VALORES-CONFIDENCIAIS.md a partir dos .p12 locais."""
from __future__ import annotations

import warnings
from pathlib import Path

from cryptography.hazmat.primitives.serialization import (
    Encoding,
    NoEncryption,
    PrivateFormat,
    pkcs12,
)

warnings.filterwarnings("ignore", category=DeprecationWarning)

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "vercel-efi-env-VALORES-CONFIDENCIAIS.md"
P12_H = Path(r"c:\Users\jesse\Desktop\efi\homologacao-892020-sistema efi box.p12")
P12_P = Path(r"c:\Users\jesse\Desktop\efi\producao-892020-Sistema Efi.p12")


def p12_to_one_line_pem(p12_path: Path) -> tuple[str, str]:
    data = p12_path.read_bytes()
    key, cert, _ = pkcs12.load_key_and_certificates(data, None)
    if not key or not cert:
        raise SystemExit(f"PKCS12 sem chave/cert: {p12_path}")
    cert_s = cert.public_bytes(Encoding.PEM).decode().strip().replace("\n", r"\n")
    key_s = (
        key.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption())
        .decode()
        .strip()
        .replace("\n", r"\n")
    )
    return cert_s, key_s


def fenced(title: str, body: str) -> str:
    return f"### {title}\n\n```\n{body}\n```\n\n"


def main() -> None:
    hc, hk = p12_to_one_line_pem(P12_H)
    pc, pk = p12_to_one_line_pem(P12_P)

    md = []
    md.append("# Variáveis Vercel — Efí Abertura de Contas (homolog + produção)\n\n")
    md.append(
        "> **Contém chave privada.** Não faça commit deste arquivo (está no `.gitignore`).\n"
    )
    md.append(
        "> **Client ID e Client Secret** não vêm do `.p12`. Copie do painel Efí (Abertura de Contas) "
        "ou de **Supabase → Edge Functions → Secrets**.\n\n"
    )
    md.append(
        "No Vercel: **Settings → Environment Variables**. Use **Production** (e **Preview** se quiser). "
        "Nos PEMs, cada `\\n` é a sequência **dois caracteres** (barra invertida + n), como no Supabase.\n\n"
    )
    md.append("---\n\n## Homologação\n\n")
    md.append(fenced("`EFI_REGISTRATION_CLIENT_ID_HOMOLOG`", "COLE_AQUI_O_CLIENT_ID_DE_HOMOLOGACAO"))
    md.append(fenced("`EFI_REGISTRATION_CLIENT_SECRET_HOMOLOG`", "COLE_AQUI_O_CLIENT_SECRET_DE_HOMOLOGACAO"))
    md.append(fenced("`EFI_REGISTRATION_CERT_PEM_HOMOLOG`", hc))
    md.append(fenced("`EFI_REGISTRATION_KEY_PEM_HOMOLOG`", hk))
    md.append("---\n\n## Produção\n\n")
    md.append(fenced("`EFI_REGISTRATION_CLIENT_ID_PRODUCTION`", "COLE_AQUI_O_CLIENT_ID_DE_PRODUCAO"))
    md.append(fenced("`EFI_REGISTRATION_CLIENT_SECRET_PRODUCTION`", "COLE_AQUI_O_CLIENT_SECRET_DE_PRODUCAO"))
    md.append(fenced("`EFI_REGISTRATION_CERT_PEM_PRODUCTION`", pc))
    md.append(fenced("`EFI_REGISTRATION_KEY_PEM_PRODUCTION`", pk))
    md.append("---\n\n## Proxy mTLS\n\n")
    md.append(
        "- `EFI_REGISTRATION_MTLS_PROXY_SECRET` — mesmo valor do secret **Supabase** "
        "`EFI_REGISTRATION_MTLS_PROXY_SECRET`.\n"
    )

    OUT.write_text("".join(md), encoding="utf-8")
    print("Wrote", OUT)


if __name__ == "__main__":
    main()
