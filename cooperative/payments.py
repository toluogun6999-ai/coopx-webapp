"""
Paystack integration.
Thin wrapper around the Paystack REST API for real bank-account verification,
deposits (charge) and withdrawals (transfers). All money-moving state changes
must only be applied once Paystack's webhook confirms the transaction — never
from these initiate-only calls.
"""
import hashlib
import hmac

import requests
from django.conf import settings

PAYSTACK_BASE_URL = "https://api.paystack.co"


class PaystackError(Exception):
    pass


def _headers():
    if not settings.PAYSTACK_SECRET_KEY:
        raise PaystackError("PAYSTACK_SECRET_KEY is not configured")
    return {
        "Authorization": f"Bearer {settings.PAYSTACK_SECRET_KEY}",
        "Content-Type": "application/json",
    }


def _request(method, path, **kwargs):
    resp = requests.request(method, f"{PAYSTACK_BASE_URL}{path}", headers=_headers(), timeout=15, **kwargs)
    data = resp.json()
    if not resp.ok or not data.get("status", False):
        raise PaystackError(data.get("message", f"Paystack request failed ({resp.status_code})"))
    return data["data"]


def list_banks(country="nigeria"):
    return _request("GET", f"/bank?country={country}")


def resolve_account(account_number, bank_code):
    """Verify a bank account exists and return its registered account name."""
    return _request("GET", f"/bank/resolve?account_number={account_number}&bank_code={bank_code}")


def initialize_transaction(email, amount_naira, reference, callback_url=None):
    """Start a deposit. Amount is in Naira; Paystack expects kobo."""
    payload = {
        "email": email,
        "amount": int(round(float(amount_naira) * 100)),
        "reference": reference,
    }
    if callback_url:
        payload["callback_url"] = callback_url
    return _request("POST", "/transaction/initialize", json=payload)


def verify_transaction(reference):
    """Server-side confirmation of a deposit. Never trust the client redirect alone."""
    return _request("GET", f"/transaction/verify/{reference}")


def create_transfer_recipient(account_number, bank_code, name):
    payload = {
        "type": "nuban",
        "name": name,
        "account_number": account_number,
        "bank_code": bank_code,
        "currency": "NGN",
    }
    return _request("POST", "/transferrecipient", json=payload)


def initiate_transfer(recipient_code, amount_naira, reference, reason="Withdrawal"):
    payload = {
        "source": "balance",
        "amount": int(round(float(amount_naira) * 100)),
        "recipient": recipient_code,
        "reference": reference,
        "reason": reason,
    }
    return _request("POST", "/transfer", json=payload)


def verify_webhook_signature(request_body: bytes, signature_header: str) -> bool:
    if not settings.PAYSTACK_SECRET_KEY or not signature_header:
        return False
    computed = hmac.new(
        settings.PAYSTACK_SECRET_KEY.encode("utf-8"),
        request_body,
        hashlib.sha512,
    ).hexdigest()
    return hmac.compare_digest(computed, signature_header)
