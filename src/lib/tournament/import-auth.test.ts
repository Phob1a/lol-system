import { expect, it } from 'vitest';
import { resolveImportAuth } from './import-service';
it('token 命中 => SCRIPT', () => expect(resolveImportAuth('tk', false, 'tk')).toEqual({ source: 'SCRIPT' }));
it('token 为空 env 时不启用 token 分支', () => expect(resolveImportAuth('tk', false, undefined)).toEqual({ error: 401 }));
it('token 不匹配但 admin => UPLOAD', () => expect(resolveImportAuth('wrong', true, 'tk')).toEqual({ source: 'UPLOAD' }));
it('无 token 但 admin => UPLOAD', () => expect(resolveImportAuth(null, true, 'tk')).toEqual({ source: 'UPLOAD' }));
it('都没有 => 401', () => expect(resolveImportAuth(null, false, 'tk')).toEqual({ error: 401 }));
