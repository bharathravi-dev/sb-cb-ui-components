import { Injectable } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { APP_DB_STORES, ConfigurationsService, IndexedDbService } from '@sunbird-cb/utils-v2'
import { Observable, from } from 'rxjs'

const API_ENDPOINTS = {
  DICTIONARY: '/apis/proxies/v8/content/v5/dictionary',
  CONTENT_READ: (doId: string) => `/apis/proxies/v8/content/v2/read/${doId}`,
}

const STORE_NAME = APP_DB_STORES.DICTIONARY
const TIME_CHECK_KEY = 'timeCheck'
const SERVICE_KEY = 'dictionaryService'
const DICT_DB_KEY = 'all'

@Injectable({
  providedIn: 'root',
})
export class ContentDictionaryService {

  // the dictionary request in flight, shared so callers that miss the cache together
  // (a strip resolving every card at once) trigger one download, not one each
  private dictionaryRequest: Promise<Record<string, any>> | null = null

  constructor(
    private http: HttpClient,
    private configSvc: ConfigurationsService,
    private appDb: IndexedDbService,
  ) {}

  // ── IndexedDB helpers ──────────────────────────────────────────────────────
  //
  // The database itself is owned by IndexedDbService; this service only owns its store.

  private dbGet<T>(key: string): Promise<T | undefined> {
    return this.appDb.get<T>(STORE_NAME, key)
  }

  private dbPut(key: string, value: any): Promise<void> {
    return this.appDb.put(STORE_NAME, key, value)
  }

  // ── Cache validity ─────────────────────────────────────────────────────────

  private isCacheValid(): boolean {
    const expirySeconds: number = this.configSvc.globalConfig?.apicache?.dictionaryTime ?? 300
    const raw = localStorage.getItem(TIME_CHECK_KEY)
    if (!raw) {
      return false
    }
    try {
      const timeCheck = JSON.parse(raw)
      const savedAt: number = timeCheck[SERVICE_KEY]
      if (!savedAt) {
        return false
      }
      return (Date.now() - savedAt) / 1000 < expirySeconds
    } catch {
      return false
    }
  }

  private saveCacheTimestamp(): void {
    let timeCheck: Record<string, number> = {}
    try {
      const raw = localStorage.getItem(TIME_CHECK_KEY)
      if (raw) {
        timeCheck = JSON.parse(raw)
      }
    } catch { /* ignore malformed value */ }
    timeCheck[SERVICE_KEY] = Date.now()
    localStorage.setItem(TIME_CHECK_KEY, JSON.stringify(timeCheck))
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Returns the full dictionary (keyed by do_id).
   * Serves from IndexedDB when the cache is still valid, otherwise fetches from the API.
   * @param forceRefresh bypass cache and always call the API
   */
  getDictionary(forceRefresh = false): Observable<Record<string, any>> {
    return from(this.getDictionaryAsync(forceRefresh))
  }

  private async getDictionaryAsync(forceRefresh: boolean): Promise<Record<string, any>> {
    if (!forceRefresh && this.isCacheValid()) {
      const cached = await this.dbGet<Record<string, any>>(DICT_DB_KEY)
      if (cached) {
        return cached
      }
    }
    return this.fetchAndCacheDictionary()
  }

  private fetchAndCacheDictionary(): Promise<Record<string, any>> {
    if (!this.dictionaryRequest) {
      this.dictionaryRequest = this.requestDictionary()
        .finally(() => { this.dictionaryRequest = null })
    }
    return this.dictionaryRequest
  }

  private async requestDictionary(): Promise<Record<string, any>> {
    const res: any = await this.http.get<any>(API_ENDPOINTS.DICTIONARY).toPromise()
    const dictionary: Record<string, any> = res?.result ?? {}
    await this.dbPut(DICT_DB_KEY, dictionary)
    this.saveCacheTimestamp()
    return dictionary
  }

  private isDictionaryEnabled(): boolean {
    return !!this.configSvc.globalConfig?.apis?.content?.dictionary?.enabled
  }

  /**
   * The dictionary used to look a content up. Nothing preloads it, so the first lookup
   * downloads it (when enabled via global-config apis.content.dictionary) and later lookups
   * are served from IndexedDB until it expires. Disabled, or when the download fails,
   * whatever is already cached is used and lookups fall through to content read.
   */
  private async lookupDictionary(): Promise<Record<string, any>> {
    if (this.isDictionaryEnabled()) {
      try {
        return await this.getDictionaryAsync(false)
      } catch (err) {
        console.warn('ContentDictionaryService: dictionary fetch failed, using cached copy', err)
      }
    }
    return (await this.dbGet<Record<string, any>>(DICT_DB_KEY)) ?? {}
  }

  /**
   * Returns a single content item by do_id.
   * Lookup order: dictionary (fetched on first use) → individual IndexedDB entry → content read API.
   * When fetched from the API the result is saved to IndexedDB and merged into the dictionary.
   */
  getContent(doId: string): Observable<any> {
    return from(this.getContentAsync(doId))
  }

  private async getContentAsync(doId: string): Promise<any> {
    // 1. Check the full dictionary
    const dictionary = await this.lookupDictionary()
    if (dictionary[doId]) {
      return dictionary[doId]
    }
    return this.resolveMissingContent(doId)
  }

  // steps 2–3 of getContent(), for an id the dictionary does not hold
  private async resolveMissingContent(doId: string): Promise<any> {
    // 2. Check individual entry stored from a previous content read call
    const cached = await this.dbGet<any>(doId)
    if (cached) {
      return cached
    }

    // 3. Fetch from content read API, update IndexedDB
    let content: any = null
    try {
      const res: any = await this.http.get<any>(API_ENDPOINTS.CONTENT_READ(doId)).toPromise()
      content = res?.result?.content ?? null
    } catch (err) {
      console.warn('ContentDictionaryService: content read API failed for', doId, err)
    }

    if (content) {
      await this.dbPut(doId, content)
      // Merge into the dictionary so subsequent getDictionary() calls include it
      const dict: Record<string, any> = (await this.dbGet<Record<string, any>>(DICT_DB_KEY)) ?? {}
      dict[doId] = content
      await this.dbPut(DICT_DB_KEY, dict)
    }

    return content
  }

  /**
   * Bulk variant of getContent(). Resolves many do_ids with at most ONE dictionary
   * fetch instead of one lookup per id.
   *
   * Prefer this over forkJoin(ids.map(id => getContent(id))): getContent() re-reads the
   * whole dictionary blob per id, and on a cold cache each miss issues its own content-read
   * plus a read-modify-write of the shared blob, so concurrent misses overwrite each other.
   * Misses are resolved sequentially here for that reason.
   *
   * @returns map of do_id -> content metadata; ids that cannot be resolved are omitted.
   */
  getContents(doIds: string[]): Observable<Record<string, any>> {
    return from(this.getContentsAsync(doIds))
  }

  private async getContentsAsync(doIds: string[]): Promise<Record<string, any>> {
    const resolved: Record<string, any> = {}
    const uniqueIds = Array.from(new Set((doIds || []).filter(Boolean)))
    if (!uniqueIds.length) {
      return resolved
    }

    // same rule as getContent(): download the dictionary only while it is enabled in global config
    const dictionary = await this.lookupDictionary()

    const missing: string[] = []
    uniqueIds.forEach((id: string) => {
      if (dictionary && dictionary[id]) {
        resolved[id] = dictionary[id]
      } else {
        missing.push(id)
      }
    })

    // Sequential: resolveMissingContent() read-modify-writes the shared dictionary blob.
    for (const id of missing) {
      try {
        const content = await this.resolveMissingContent(id)
        if (content) {
          resolved[id] = content
        }
      } catch (err) {
        console.warn('ContentDictionaryService: unable to resolve content', id, err)
      }
    }

    return resolved
  }

  /** Clears IndexedDB store and resets the cache timestamp. */
  clearCache(): Observable<void> {
    return from(this.clearCacheAsync())
  }

  private async clearCacheAsync(): Promise<void> {
    await this.appDb.clear(STORE_NAME)
    try {
      const raw = localStorage.getItem(TIME_CHECK_KEY)
      if (raw) {
        const timeCheck = JSON.parse(raw)
        delete timeCheck[SERVICE_KEY]
        localStorage.setItem(TIME_CHECK_KEY, JSON.stringify(timeCheck))
      }
    } catch { /* ignore */ }
  }

  /** Returns diagnostic information about the current cache state. */
  async getCacheStats(): Promise<{ itemCount: number; lastUpdate: string | null; cacheAge: number; expiryTime: number }> {
    const expiryTime: number = this.configSvc.globalConfig?.apicache?.dictionaryTime ?? 300
    let savedAt: number | null = null
    try {
      const raw = localStorage.getItem(TIME_CHECK_KEY)
      if (raw) {
        savedAt = JSON.parse(raw)[SERVICE_KEY] ?? null
      }
    } catch { /* ignore */ }

    const dictionary = await this.dbGet<Record<string, any>>(DICT_DB_KEY)
    const itemCount = dictionary ? Object.keys(dictionary).length : 0
    const cacheAge = savedAt ? Math.floor((Date.now() - savedAt) / 1000) : -1
    const lastUpdate = savedAt ? new Date(savedAt).toISOString() : null

    return { itemCount, lastUpdate, cacheAge, expiryTime }
  }
}
