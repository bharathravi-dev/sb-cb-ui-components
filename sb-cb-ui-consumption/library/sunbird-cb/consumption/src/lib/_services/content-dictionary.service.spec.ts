import { of, throwError } from 'rxjs';

import { ContentDictionaryService } from './content-dictionary.service';

jest.mock('@sunbird-cb/utils-v2', () => ({
  APP_DB_STORES: { DICTIONARY: 'dictionary' },
  ConfigurationsService: class { },
  IndexedDbService: class { },
}));

const DICTIONARY_URL = '/apis/proxies/v8/content/v5/dictionary';
const readUrl = (id: string) => `/apis/proxies/v8/content/v2/read/${id}`;

describe('ContentDictionaryService', () => {
  let service: ContentDictionaryService;
  let http: any;
  let configSvc: any;
  let store: Map<string, any>;
  let routes: Record<string, any>;

  const callsTo = (url: string) => http.get.mock.calls.filter((c: any[]) => c[0] === url).length;

  beforeEach(() => {
    localStorage.clear();
    store = new Map();
    routes = {
      [DICTIONARY_URL]: { result: { do_1: { identifier: 'do_1' } } },
      [readUrl('do_2')]: { result: { content: { identifier: 'do_2' } } },
    };
    http = {
      get: jest.fn((url: string) => routes[url] instanceof Error ? throwError(() => routes[url]) : of(routes[url])),
    };
    configSvc = { globalConfig: { apis: { content: { dictionary: { enabled: true } } } } };
    const appDb: any = {
      get: jest.fn(async (_s: string, key: string) => store.get(key)),
      put: jest.fn(async (_s: string, key: string, value: any) => { store.set(key, value); }),
      clear: jest.fn(async () => store.clear()),
    };
    service = new ContentDictionaryService(http, configSvc, appDb);
  });

  it('fetches the dictionary on the first lookup, not before', async () => {
    expect(http.get).not.toHaveBeenCalled();
    const content = await service.getContent('do_1').toPromise();
    expect(content).toEqual({ identifier: 'do_1' });
    expect(callsTo(DICTIONARY_URL)).toBe(1);
  });

  it('shares one dictionary download between concurrent lookups', async () => {
    await Promise.all(['do_1', 'do_1', 'do_1'].map(id => service.getContent(id).toPromise()));
    expect(callsTo(DICTIONARY_URL)).toBe(1);
  });

  it('serves later lookups from IndexedDB while the cache is valid', async () => {
    await service.getContent('do_1').toPromise();
    await service.getContent('do_1').toPromise();
    expect(callsTo(DICTIONARY_URL)).toBe(1);
  });

  it('downloads the dictionary again once the cached copy has expired', async () => {
    await service.getContent('do_1').toPromise();
    const expiredAt = Date.now() - 301 * 1000;
    localStorage.setItem('timeCheck', JSON.stringify({ dictionaryService: expiredAt }));
    routes[DICTIONARY_URL] = { result: { do_1: { identifier: 'do_1', refreshed: true } } };
    const content = await service.getContent('do_1').toPromise();
    expect(content).toEqual({ identifier: 'do_1', refreshed: true });
    expect(callsTo(DICTIONARY_URL)).toBe(2);
  });

  it('falls back to content read for an id the dictionary does not hold', async () => {
    const content = await service.getContent('do_2').toPromise();
    expect(content).toEqual({ identifier: 'do_2' });
    expect(callsTo(readUrl('do_2'))).toBe(1);
  });

  it('falls back to content read when the dictionary download fails', async () => {
    routes[DICTIONARY_URL] = new Error('down');
    const content = await service.getContent('do_2').toPromise();
    expect(content).toEqual({ identifier: 'do_2' });
  });

  it('never calls the dictionary API when it is disabled', async () => {
    configSvc.globalConfig.apis.content.dictionary.enabled = false;
    await service.getContent('do_2').toPromise();
    expect(callsTo(DICTIONARY_URL)).toBe(0);
    expect(callsTo(readUrl('do_2'))).toBe(1);
  });

  it('getContents never calls the dictionary API when it is disabled', async () => {
    configSvc.globalConfig.apis.content.dictionary.enabled = false;
    routes[readUrl('do_3')] = { result: { content: { identifier: 'do_3' } } };
    const result = await service.getContents(['do_2', 'do_3']).toPromise();
    expect(callsTo(DICTIONARY_URL)).toBe(0);
    expect(Object.keys(result || {})).toEqual(['do_2', 'do_3']);
  });

  it('getContents does not retry a failed dictionary download per missing id', async () => {
    routes[DICTIONARY_URL] = new Error('down');
    routes[readUrl('do_3')] = { result: { content: { identifier: 'do_3' } } };
    const result = await service.getContents(['do_2', 'do_3']).toPromise();
    expect(Object.keys(result || {})).toEqual(['do_2', 'do_3']);
    expect(callsTo(DICTIONARY_URL)).toBe(1);
  });
});
