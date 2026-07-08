import { hashPassword, verifyPassword } from './password.util';

describe('password.util', () => {
  it('hashea y verifica correctamente', async () => {
    const hash = await hashPassword('Secreta123!');
    expect(hash).not.toEqual('Secreta123!');
    expect(await verifyPassword('Secreta123!', hash)).toBe(true);
  });

  it('rechaza una contrasena incorrecta', async () => {
    const hash = await hashPassword('Secreta123!');
    expect(await verifyPassword('otra', hash)).toBe(false);
  });
});
