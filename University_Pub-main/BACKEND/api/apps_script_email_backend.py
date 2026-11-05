import json
import logging
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings
from django.core.mail.backends.base import BaseEmailBackend


logger = logging.getLogger(__name__)


class GoogleAppsScriptEmailBackend(BaseEmailBackend):
    def send_messages(self, email_messages):
        if not email_messages:
            return 0

        sent_count = 0
        for email_message in email_messages:
            try:
                sent = self._send_message(email_message)
                sent_count += int(sent)
            except Exception:
                if not self.fail_silently:
                    raise
                logger.exception("Unable to send email through Google Apps Script.")

        return sent_count

    def _send_message(self, email_message):
        endpoint = getattr(settings, "APPS_SCRIPT_MAIL_ENDPOINT", "").strip()
        api_key = getattr(settings, "APPS_SCRIPT_MAIL_API_KEY", "").strip()
        timeout = getattr(settings, "APPS_SCRIPT_MAIL_TIMEOUT", 20)

        if not endpoint or not api_key:
            raise RuntimeError(
                "APPS_SCRIPT_MAIL_ENDPOINT and APPS_SCRIPT_MAIL_API_KEY must be configured."
            )

        html_body = ""
        for content, mime_type in getattr(email_message, "alternatives", []):
            if mime_type == "text/html":
                html_body = content
                break

        payload = {
            "apiKey": api_key,
            "from": email_message.from_email or settings.DEFAULT_FROM_EMAIL,
            "to": email_message.to,
            "cc": getattr(email_message, "cc", []),
            "bcc": getattr(email_message, "bcc", []),
            "replyTo": getattr(email_message, "reply_to", []),
            "subject": email_message.subject,
            "text": email_message.body,
            "html": html_body,
        }
        request = Request(
            endpoint,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json; charset=utf-8"},
            method="POST",
        )

        try:
            with urlopen(request, timeout=timeout) as response:
                result = json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            logger.error("Google Apps Script returned HTTP %s: %s", exc.code, body)
            raise
        except (URLError, TimeoutError, json.JSONDecodeError):
            raise

        if result.get("ok") is not True:
            raise RuntimeError(result.get("error", "Google Apps Script rejected the email."))
        return True
