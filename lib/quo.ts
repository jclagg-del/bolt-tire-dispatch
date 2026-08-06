function cleanPhoneNumber(phone?: string | null) {
  if (!phone) return "";
  return phone.replace(/[^\d+]/g, "");
}

function appendFromNumber(params: URLSearchParams) {
  const fromNumber = cleanPhoneNumber(
    process.env.NEXT_PUBLIC_QUO_PHONE_NUMBER
  );

  if (fromNumber) {
    params.set("from", fromNumber);
  }
}

export function getQuoCallUrl(phone?: string | null) {
  const number = cleanPhoneNumber(phone);
  if (!number) return null;

  const params = new URLSearchParams({
    number,
    action: "call",
  });
  appendFromNumber(params);

  return `openphone://dial?${params.toString()}`;
}

export function getQuoTextUrl(phone?: string | null, message?: string) {
  const number = cleanPhoneNumber(phone);
  if (!number) return null;

  const params = new URLSearchParams({ number });
  appendFromNumber(params);

  if (message) {
    params.set("text", message);
  }

  return `openphone://message?${params.toString()}`;
}
