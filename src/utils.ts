export const hasCredential = (employeeCredentials: string | undefined, requiredCredentials: string | undefined): boolean => {
  if (!requiredCredentials) return true;
  if (!employeeCredentials) return false;

  const empCreds = employeeCredentials.split(',').map(c => c.trim());
  const reqCreds = requiredCredentials.split(',').map(c => c.trim());

  return reqCreds.every(req => empCreds.includes(req));
};
