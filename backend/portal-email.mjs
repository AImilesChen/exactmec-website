const validEmail = value => typeof value === 'string' && value.length <= 240 && /^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(value);

export function customerEmailAvailable(env = {}) {
  return env.CUSTOMER_EMAIL_ENABLED === 'true' && env.CUSTOMER_EMAIL_FROM === 'sales@exactmec.com' && typeof env.CUSTOMER_EMAIL?.send === 'function';
}

export async function sendCustomerLoginCode(env, {email, code, expiresMinutes}) {
  if (!customerEmailAvailable(env) || !validEmail(email) || !/^\d{6}$/.test(code) || expiresMinutes !== 10) throw new Error('customer_email_unavailable');
  let timer;
  try {
    const result = await Promise.race([
      env.CUSTOMER_EMAIL.send({
        from: env.CUSTOMER_EMAIL_FROM,
        to: email,
        subject: 'Your EXACTMEC inquiry sign-in code',
        text: `Your EXACTMEC inquiry sign-in code is ${code}.\n\nThis code expires in ${expiresMinutes} minutes and can be used once.\nIf you did not request it, ignore this email.\n\nEXACTMEC\nhttps://exactmec.com/account/login/\n`,
      }),
      new Promise((_, reject) => {timer = setTimeout(() => reject(new Error('customer_email_unconfirmed')), 15000);}),
    ]);
    if (!result || typeof result.messageId !== 'string' || !result.messageId) throw new Error('customer_email_unconfirmed');
    return {accepted: true};
  } finally {clearTimeout(timer);}
}
