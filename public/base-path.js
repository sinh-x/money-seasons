// Startup-owned public URL prefix. Never normalize untrusted or malformed values.
export function validateBasePath(value = '') {
  if (typeof value !== 'string' || value.length > 128 ||
      (value !== '' && !/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(value))) {
    throw new Error('Invalid application base path');
  }
  return value;
}
