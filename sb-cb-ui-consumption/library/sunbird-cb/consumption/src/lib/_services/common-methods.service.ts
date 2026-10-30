import { Injectable } from '@angular/core'
import { ConfigurationsService } from '@sunbird-cb/utils-v2'
import { NsContent } from '../_models/widget-content.model'
import { NsContentStripWithTabs } from '../_common/content-strip-with-tabs-lib/content-strip-with-tabs-lib.model'
import { NsCommonStrip } from '../_common/common-strip/common-strip.model'
import * as _ from 'lodash'

// localStorage key holding, per apicache key, when (and for which user) that API was last called
const API_CACHE_TIME_KEY = 'apiCacheTimeCheck'

export interface ConfigDetails {
  apiConfig: any,
  urlConfigPath: string,
  defaultUrl: string,
}

@Injectable({
  providedIn: 'root'
})
export class CommonMethodsService {

  constructor(private configSvc: ConfigurationsService) { }

  transformContentsToWidgets(
    contents: NsContent.IContent[],
    strip: NsContentStripWithTabs.IContentStripUnit | NsCommonStrip.ICommonStripUnit,
  ) {
    return (contents || []).map((content, idx) => (
      content ? {
        widgetType: 'cardLib',
        widgetSubType: 'cardContentLib',
        widgetHostClass: 'mb-2',
        widgetData: {
          content,
          ...(content.batch && { batch: content.batch }),
          cardSubType: strip.stripConfig && strip.stripConfig.cardSubType,
          cardCustomeClass: strip.customeClass ? strip.customeClass : '',
          context: { pageSection: strip.key, position: idx },
          intranetMode: strip.stripConfig && strip.stripConfig.intranetMode,
          deletedMode: strip.stripConfig && strip.stripConfig.deletedMode,
          contentTags: strip.stripConfig && strip.stripConfig.contentTags,
        },
      } : {
        widgetType: 'card',
        widgetSubType: 'cardContent',
        widgetHostClass: 'mb-2',
        widgetData: {},
      }
    ))
  }
  transformSkeletonToWidgets(
    strip: any
  ) {
    return [1, 2, 3, 4, 5, 6, 7, 7, 8, 9, 10].map(_content => ({
      widgetType: 'cardLib',
      widgetSubType: 'cardContentLib',
      widgetHostClass: 'mb-2',
      widgetData: {
        cardSubType: strip.loaderConfig && strip.loaderConfig.cardSubType || 'card-standard-skeleton',
        cardCustomeClass: strip.customeClass ? strip.customeClass : '',
      },
    }))
  }

  handleCapitalize(str: string, type?: string): string {
    let returnValue = ''
    if (str) {
      if (type === 'name') {
        returnValue = str.split(' ').map(_str => {
          return _str.charAt(0).toUpperCase() + _str.slice(1)
        }).join(' ')
      } else {

        returnValue = str && (str.charAt(0).toUpperCase() + str.slice(1))
      }
    }
    return returnValue
  }

  transformContentsToWidgetsWithoutStrip(
    contents: NsContent.IContent[]

  ) {
    return (contents || []).map((content, idx) => (
      content ? {
        widgetType: 'cardLib',
        widgetSubType: 'cardContentLib',
        widgetHostClass: 'mb-2',
        widgetData: {
          content,
          ...(content.batch && { batch: content.batch }),
        },
      } : {
        widgetType: 'card',
        widgetSubType: 'cardContent',
        widgetHostClass: 'mb-2',
        widgetData: {},
      }
    ))
  }

  getCourseUnitIds() {
    return localStorage.getItem('comprehensiveAssessmentCourseUnits')
  }

  getEnabledUrl(config: ConfigDetails): string {
    const { apiConfig, urlConfigPath, defaultUrl } = config
    if (apiConfig && urlConfigPath) {
      const config = _.get(apiConfig, urlConfigPath)
      if (config && config.enabled) {
        return config.url || defaultUrl
      } else {
        return ''
      }
    }
    return defaultUrl
  }

  /**
   * True while a response saved earlier (in localStorage) can be used instead of calling its API
   * again: saveApiCacheTime() was called for this user less than global-config
   * apicache[cacheKey] seconds ago. Without that key, or with 0, nothing is cached and this is
   * always false, so callers keep calling the API.
   * @param cacheKey the apicache key holding the expiry in seconds, e.g. 'summaryTime'
   * @param userId the signed-in user; a time saved for another user on this browser does not count
   */
  isApiCacheValid(cacheKey: string, userId: string | undefined): boolean {
    const expirySeconds = Number(_.get(this.configSvc, ['globalConfig', 'apicache', cacheKey])) || 0
    if (!userId || expirySeconds <= 0) {
      return false
    }
    const saved = this.readApiCacheTimes()[cacheKey]
    return !!saved && saved.userId === userId && !!saved.savedAt
      && (Date.now() - saved.savedAt) / 1000 < expirySeconds
  }

  /** Records that the API behind `cacheKey` was just called successfully for this user. */
  saveApiCacheTime(cacheKey: string, userId: string | undefined): void {
    if (!userId) {
      return
    }
    const times = this.readApiCacheTimes()
    times[cacheKey] = { userId, savedAt: Date.now() }
    this.writeApiCacheTimes(times)
  }

  /** Makes the next isApiCacheValid(cacheKey) false, e.g. after the data behind it changed. */
  clearApiCacheTime(cacheKey: string): void {
    const times = this.readApiCacheTimes()
    if (times[cacheKey]) {
      delete times[cacheKey]
      this.writeApiCacheTimes(times)
    }
  }

  private readApiCacheTimes(): Record<string, { userId: string, savedAt: number }> {
    try {
      const times = JSON.parse(localStorage.getItem(API_CACHE_TIME_KEY) || '{}')
      return times && typeof times === 'object' ? times : {}
    } catch {
      return {}
    }
  }

  private writeApiCacheTimes(times: Record<string, { userId: string, savedAt: number }>): void {
    try {
      localStorage.setItem(API_CACHE_TIME_KEY, JSON.stringify(times))
    } catch { /* storage unavailable: the API is simply called again next time */ }
  }
}
