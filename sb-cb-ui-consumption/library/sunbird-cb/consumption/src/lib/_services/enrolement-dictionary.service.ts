import { Injectable } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { APP_DB_STORES, ConfigurationsService, IndexedDbService } from '@sunbird-cb/utils-v2'
import { Observable, from } from 'rxjs'

const API_ENDPOINTS = {
  ENROLEMENT_DICTIONARY: '/apis/proxies/v8/user/v1/learning/dictionary',
}

// iGotAppDB -> enrollmentDetails -> current
const STORE_NAME = APP_DB_STORES.ENROLMENT
const ENROLEMENT_DB_KEY = 'current'
const TIME_CHECK_KEY = 'enrolementTimeCheck'
const DEFAULT_EXPIRY_SECONDS = 300

@Injectable({
  providedIn: 'root',
})
export class EnrolementDictionaryService {

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

  private getExpirySeconds(): number {
    return this.configSvc.globalConfig?.apicache?.enrolementTime ?? DEFAULT_EXPIRY_SECONDS
  }

  private getSavedTimestamp(): number | null {
    try {
      const raw = localStorage.getItem(TIME_CHECK_KEY)
      const savedAt = raw ? Number(JSON.parse(raw)) : NaN
      return savedAt ? savedAt : null
    } catch {
      return null
    }
  }

  private isCacheValid(): boolean {
    const savedAt = this.getSavedTimestamp()
    if (!savedAt) {
      return false
    }
    return (Date.now() - savedAt) / 1000 < this.getExpirySeconds()
  }

  private saveCacheTimestamp(): void {
    try {
      localStorage.setItem(TIME_CHECK_KEY, JSON.stringify(Date.now()))
    } catch { /* storage unavailable */ }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Returns the user's enrolment dictionary (keyed by do_id).
   * Serves from IndexedDB when the cache is still valid, otherwise fetches from the API.
   * @param forceRefresh bypass cache and always call the API
   */
  getEnrolementDictionary(forceRefresh = false): Observable<Record<string, any>> {
    return from(this.getEnrolementDictionaryAsync(forceRefresh))
  }

  private async getEnrolementDictionaryAsync(forceRefresh: boolean): Promise<Record<string, any>> {
    if (!forceRefresh && this.isCacheValid()) {
      const cached = await this.dbGet<Record<string, any>>(ENROLEMENT_DB_KEY)
      if (cached) {
        return cached
      }
    }
    return this.fetchAndCacheEnrolementDictionary()
  }

  private async fetchAndCacheEnrolementDictionary(): Promise<Record<string, any>> {
    const res: any = await this.http.get<any>(API_ENDPOINTS.ENROLEMENT_DICTIONARY).toPromise()
    const dictionary: Record<string, any> = res?.result?.response ?? {}
    await this.dbPut(ENROLEMENT_DB_KEY, dictionary)
    this.saveCacheTimestamp()
    return dictionary
  }

  /**
   * Adds a record to the cached enrolment dictionary and saves it back.
   * Existing entries are kept; an entry with the same do_id is overwritten.
   * Does not touch the cache timestamp, so it never extends the life of stale data.
   *
   * @param record object in the dictionary's own shape, e.g.
   *   { do_123: { primaryCategory: 'Course', courseCategory: 'Course', active: true, status: 0 } }
   */
  addEnrolement(record: Record<string, any>): Observable<void> {
    return from(this.addEnrolementAsync(record))
  }

  private async addEnrolementAsync(record: Record<string, any>): Promise<void> {
    const existing = (await this.dbGet<Record<string, any>>(ENROLEMENT_DB_KEY)) ?? {}
    const merged: Record<string, any> = { ...existing, ...(record || {}) }
    await this.dbPut(ENROLEMENT_DB_KEY, merged)
  }

  /**
   * Marks a course as un-enrolled in the cached enrolment dictionary and saves it back.
   * The entry is kept; only active is set to false and status to 0.
   * Does nothing if the course is not in the dictionary.
   * Does not touch the cache timestamp.
   *
   * @param courseId do_id of the course that was un-enrolled
   */
  updateUnEnrolement(courseId: string): Observable<void> {
    return from(this.updateUnEnrolementAsync(courseId))
  }

  private async updateUnEnrolementAsync(courseId: string): Promise<void> {
    const existing = await this.dbGet<Record<string, any>>(ENROLEMENT_DB_KEY)
    if (!existing || !courseId || !existing[courseId]) {
      return
    }
    const updated: Record<string, any> = {
      ...existing,
      [courseId]: { ...existing[courseId], active: false},
    }
    await this.dbPut(ENROLEMENT_DB_KEY, updated)
  }

  /** Clears the stored enrolment dictionary and resets the cache timestamp. */
  clearCache(): Observable<void> {
    return from(this.clearCacheAsync())
  }

  private async clearCacheAsync(): Promise<void> {
    await this.appDb.delete(STORE_NAME, ENROLEMENT_DB_KEY)
    try {
      localStorage.removeItem(TIME_CHECK_KEY)
    } catch { /* ignore */ }
  }
}
