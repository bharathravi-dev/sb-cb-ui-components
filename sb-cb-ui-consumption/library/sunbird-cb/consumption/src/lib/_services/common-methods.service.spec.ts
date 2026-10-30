import { CommonMethodsService } from './common-methods.service';

jest.mock('@sunbird-cb/utils-v2', () => ({
  ConfigurationsService: class { },
}));

describe('CommonMethodsService', () => {
  let service: CommonMethodsService;
  let configSvc: any;

  beforeEach(() => {
    localStorage.clear();
    configSvc = { globalConfig: { apicache: { summaryTime: 600 } } };
    service = new CommonMethodsService(configSvc);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('api cache times', () => {
    const saveAgo = (key: string, userId: string, secondsAgo: number) => {
      const times = JSON.parse(localStorage.getItem('apiCacheTimeCheck') || '{}');
      times[key] = { userId, savedAt: Date.now() - secondsAgo * 1000 };
      localStorage.setItem('apiCacheTimeCheck', JSON.stringify(times));
    };

    it('is valid right after a save for the same user', () => {
      service.saveApiCacheTime('summaryTime', 'u1');
      expect(service.isApiCacheValid('summaryTime', 'u1')).toBe(true);
    });

    it('is not valid before anything was saved', () => {
      expect(service.isApiCacheValid('summaryTime', 'u1')).toBe(false);
    });

    it('expires after the apicache seconds', () => {
      saveAgo('summaryTime', 'u1', 599);
      expect(service.isApiCacheValid('summaryTime', 'u1')).toBe(true);
      saveAgo('summaryTime', 'u1', 601);
      expect(service.isApiCacheValid('summaryTime', 'u1')).toBe(false);
    });

    it('is not valid for another user', () => {
      service.saveApiCacheTime('summaryTime', 'u1');
      expect(service.isApiCacheValid('summaryTime', 'u2')).toBe(false);
    });

    it('is never valid without a user', () => {
      service.saveApiCacheTime('summaryTime', undefined);
      expect(localStorage.getItem('apiCacheTimeCheck')).toBeNull();
      expect(service.isApiCacheValid('summaryTime', undefined)).toBe(false);
    });

    it.each([undefined, 0, 'abc'])('is never valid when the apicache key is %s', (value) => {
      configSvc.globalConfig.apicache.summaryTime = value;
      service.saveApiCacheTime('summaryTime', 'u1');
      expect(service.isApiCacheValid('summaryTime', 'u1')).toBe(false);
    });

    it('is not valid without global config', () => {
      configSvc.globalConfig = undefined;
      service.saveApiCacheTime('summaryTime', 'u1');
      expect(service.isApiCacheValid('summaryTime', 'u1')).toBe(false);
    });

    it('keeps each key separate', () => {
      configSvc.globalConfig.apicache.notificationCountTime = 60;
      service.saveApiCacheTime('summaryTime', 'u1');
      expect(service.isApiCacheValid('notificationCountTime', 'u1')).toBe(false);
      service.saveApiCacheTime('notificationCountTime', 'u1');
      expect(service.isApiCacheValid('summaryTime', 'u1')).toBe(true);
      expect(service.isApiCacheValid('notificationCountTime', 'u1')).toBe(true);
    });

    it('clears one key and leaves the others', () => {
      configSvc.globalConfig.apicache.notificationCountTime = 60;
      service.saveApiCacheTime('summaryTime', 'u1');
      service.saveApiCacheTime('notificationCountTime', 'u1');
      service.clearApiCacheTime('summaryTime');
      expect(service.isApiCacheValid('summaryTime', 'u1')).toBe(false);
      expect(service.isApiCacheValid('notificationCountTime', 'u1')).toBe(true);
      service.clearApiCacheTime('missing');
    });

    it('treats an unreadable saved value as nothing saved', () => {
      localStorage.setItem('apiCacheTimeCheck', '{bad json');
      expect(service.isApiCacheValid('summaryTime', 'u1')).toBe(false);
      service.saveApiCacheTime('summaryTime', 'u1');
      expect(service.isApiCacheValid('summaryTime', 'u1')).toBe(true);
    });
  });
});
