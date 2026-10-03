import { HttpClient, HttpHeaders } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { ConfigurationsService } from '@sunbird-cb/utils-v2'
import { BehaviorSubject, EMPTY, Observable, of, throwError } from 'rxjs'
import { catchError, map, retry, shareReplay } from 'rxjs/operators'
import { NsContentStripMultiple } from '../content-strip-multiple/content-strip-multiple.model'
import { NsContent } from './widget-content.model'
import { NSSearch } from './widget-search.model'
import moment from 'moment'
import { viewerRouteGenerator } from './viewer-route-util'

// TODO: move this in some common place
const PROTECTED_SLAG_V8 = '/apis/protected/v8'
const PROXY_SLAG_V8 = '/apis/proxies/v8'
const ACTION_CONTENT_V3 = '/action/content/v3/'

const API_END_POINTS = {
  CONTENT: `${PROTECTED_SLAG_V8}/content`,
  READ: (doId: string) => `${PROXY_SLAG_V8}/${ACTION_CONTENT_V3}read/${doId}`,
  AUTHORING_CONTENT: (doId: string) => `${PROXY_SLAG_V8}/${ACTION_CONTENT_V3}read/${doId}?mode=edit`,
  AUTHORING_CONTENT_HIERARCHY: (doId: string) => `${PROXY_SLAG_V8}/${ACTION_CONTENT_V3}hierarchy/${doId}?mode=edit`,
  AUTHORING_CONTENT_HIERARCHY_WITHOUT_EDIT: (doId: string) => `${PROXY_SLAG_V8}/${ACTION_CONTENT_V3}hierarchy/${doId}`,
  CONTENT_LIKES: `${PROTECTED_SLAG_V8}/content/likeCount`,
  SET_S3_COOKIE: `${PROTECTED_SLAG_V8}/content/setCookie`,
  SET_S3_IMAGE_COOKIE: `${PROTECTED_SLAG_V8}/content/setImageCookie`,
  FETCH_MANIFEST: `${PROTECTED_SLAG_V8}/content/getWebModuleManifest`,
  FETCH_WEB_MODULE_FILES: `${PROTECTED_SLAG_V8}/content/getWebModuleFiles`,
  MULTIPLE_CONTENT: `${PROTECTED_SLAG_V8}/content/multiple`,
  CONTENT_SEARCH_V5: `${PROTECTED_SLAG_V8}/content/searchV5`,
  CONTENT_SEARCH_V6: `${PROTECTED_SLAG_V8}/content/searchV6`,
  CONTENT_SEARCH_REGION_RECOMMENDATION: `${PROTECTED_SLAG_V8}/content/searchRegionRecommendation`,
  CONTENT_HISTORY: `${PROTECTED_SLAG_V8}/user/history`,
  USER_CONTINUE_LEARNING: `${PROTECTED_SLAG_V8}/user/history/continue`,
  // not in use
  CONTENT_RATING: `${PROTECTED_SLAG_V8}/user/rating`,
  CONTENT_RATING_V2: `${PROTECTED_SLAG_V8}/user/rating/content/average-ratingInfo`,
  // not in use
  COLLECTION_HIERARCHY: (type: string, id: string) =>
    `${PROTECTED_SLAG_V8}/content/collection/${type}/${id}`,
  REGISTRATION_STATUS: `${PROTECTED_SLAG_V8}/admin/userRegistration/checkUserRegistrationContent`,
  MARK_AS_COMPLETE_META: (contentId: string) => `${PROTECTED_SLAG_V8}/user/progress/${contentId}`,
  PROXY_CONTENT: `${PROXY_SLAG_V8}${ACTION_CONTENT_V3}`,
  ACTIVE_LEARNERS: (batchId: string) => `${PROTECTED_SLAG_V8}/cohorts/course/getUsersForBatch/${batchId}`,
  BLENDED_REQUESTS: `${PROXY_SLAG_V8}/workflow/blendedprogram/search`,
  BLEMDED_SEARCH_REQUEST: `${PROXY_SLAG_V8}/workflow/blendedprogram/searchV2/pc`,
  UPDATE_BLENDED_REQUEST: `${PROXY_SLAG_V8}/workflow/blendedprogram/update/pc`,
  REMOVE_BLENDED_REQUEST: `${PROXY_SLAG_V8}/workflow/blendedprogram/remove/approved/user`,
  GET_RATING: (contentId: string, contentType: string, userId: string) =>
    `${PROXY_SLAG_V8}/ratings/v1/read/${contentId}/${contentType}/${userId}`,
  // ADD_OR_UPDATE: `${PROXY_SLAG_V8}/ratings/v1/upsert`,
  GET_RATING_SUMMARY: (contentId: string, contentType: string) =>
    `${PROXY_SLAG_V8}/ratings/v1/summary/${contentId}/${contentType}`,
  GET_RATING_LOOKUP: `${PROXY_SLAG_V8}/ratings/v1/ratingLookUp`,
  DOWNLOAD_SESSION_QR_CODES: (courseId: string, batchId: string) => `${PROXY_SLAG_V8}/batchsesion/qrcode/${courseId}/${batchId}`,
  MARK_ATTENDENCE: `${PROXY_SLAG_V8}/blendedprogram/v1/update/progress`,
  ATTENDANCE_PROGRESS: `${PROXY_SLAG_V8}/blendedprogram/v1/getUserContentProgress`,
  ACTIVE_LEARNERS_LIST: `${PROXY_SLAG_V8}/course/v1/batch/getParticipants`,
  ADMIN_ACTIVE_LEARNERS_LIST: `${PROXY_SLAG_V8}/course/v1/batch/admin/getParticipants`,
  EXT_CONTENT_READ: (contentId: any) => `/apis/proxies/v8/cios/v1/content/read/${contentId}`,
  EXT_USER_COURSE_ENROLL: (contentId: any) => `/apis/proxies/v8/cios-enroll/v1/readby/useridcourseid/${contentId}`,
  EXT_CONTENT_EROLL: `/apis/proxies/v8/cios-enroll/v1/create`,
  EXT_PUBLIC_CONTENT: (partent: any, contentId: any) => `/apis/proxies/v8/ciosIntegration/v1/read/content/${partent}/${contentId}`,
  COURSE_BATCH_LIST: `/apis/proxies/v8/learner/course/v1/batch/list`,
  COURSE_BATCH: `/apis/proxies/v8/course/v1/batch/read`,
  CONTENT_HISTORYV2: `/apis/proxies/v8/read/content-progres`,
  AUTO_ASSIGN_BATCH: `/apis/protected/v8/cohorts/user/autoenrollment/`,
  AUTO_ASSIGN_CURATED_BATCH: `/apis/proxies/v8/curatedprogram/v1/enrol`,
  AUTO_ASSIGN_OPEN_PROGRAM: `/apis/proxies/v8/openprogram/v1/enrol`,
  BLENDED_USER_WF: `/apis/proxies/v8/workflow/blendedprogram/user/search`,
  BLENDED_USER_COUNT: `apis/proxies/v8/workflow/blendedprogram/enrol/status/count`,
  ENROLL_BATCH: `/apis/proxies/v8/learner/course/v1/enrol`,
  ENROLL_BATCH_WF: `/apis/proxies/v8/workflow/blendedprogram/enrol`,
  READ_COURSE_KARMAPOINTS: '/apis/proxies/v8/karmapoints/user/course/read',
  CLAIM_KARMAPOINTS: '/apis/proxies/v8/claimkarmapoints',
  USER_KARMA_POINTS: '/apis/proxies/v8/user/totalkarmapoints',
  WITHDRAW_BATCH_WF: `/apis/proxies/v8/workflow/blendedprogram/unenrol`,
  CONTENT_READ: (contentId: any) => `/apis/proxies/v8/action/content/v3/read/${contentId}`,
  ASSIGNMENT_STATUS: `apis/proxies/v8/forms/v2/submissions/search`,
  ASSIGNMENT_FEEDBACK: `apis/proxies/v8/assignment/v1/feedback`,
  READ_ASSIGNMENT: `apis/proxies/v8/storage/v1/bp/assignment/answer/read/file`,
  NOTIFY_FEEDBACK_SUBMISSION: `apis/proxies/v8/v1/notifyAssignment/evaluate`,
}

@Injectable({
  providedIn: 'root',
})
export class WidgetContentService {
  private updateBatchData = new BehaviorSubject(false)
  updateBatchDataObservable = this.updateBatchData.asObservable()
  currentMetaData!: NsContent.IContent
  currentContentReadMetaData!: NsContent.IContent
  currentBatchEnrollmentList!: NsContent.ICourse[]
  tocConfigData: any = new BehaviorSubject<any>({})
  tocConfigData$ = this.tocConfigData.asObservable()
  programChildCourseResumeData = new BehaviorSubject<any>({})
  programChildCourseResumeData$ = this.programChildCourseResumeData.asObservable()
  constructor(
    private http: HttpClient,
    private configSvc: ConfigurationsService
  ) { }

  changeBatchData(state: boolean) {
    this.updateBatchData.next(state)
  }

  fetchMarkAsCompleteMeta(identifier: string): Promise<any> {
    const url = API_END_POINTS.MARK_AS_COMPLETE_META(identifier)
    return this.http.get(url).toPromise()
  }

  // fetchContent(
  //   contentId: string,
  //   hierarchyType: 'all' | 'minimal' | 'detail' = 'detail',
  //   additionalFields: string[] = [],
  // ): Observable<NsContent.IContent> {
  //   const url = `${API_END_POINTS.CONTENT}/${contentId}?hierarchyType=${hierarchyType}`
  //   return this.http
  //     .post<NsContent.IContent>(url, { additionalFields })
  //     .pipe(retry(1))
  // }

  fetchContent(
    contentId: string,
    hierarchyType: 'all' | 'minimal' | 'detail' = 'detail',
    _additionalFields: string[] = [],
    primaryCategory?: string | null,
    contentStatus?: string | null,
  ): Observable<NsContent.IContent> {
    // const url = `${API_END_POINTS.CONTENT}/${contentId}?hierarchyType=${hierarchyType}`
    let url = ''
    const forPreview = window.location.href.includes('/public/') || window.location.href.includes('&preview=true') ||
      contentStatus === 'Draft' || contentStatus === 'Review'
    const isStandaloneResource = (localStorage.getItem('isStandaloneResource') === 'true')
    if (primaryCategory && this.isResource(primaryCategory)) {
      if (!forPreview) {
        url = `/apis/proxies/v8/action/content/v3/read/${contentId}`
      } else {
        if (window.location.href.includes('editMode=true') && window.location.href.includes('_rc')) {
          url = `/apis/proxies/v8/action/content/v3/read/${contentId}`
        } else {
          url = `/api/content/v1/read/${contentId}`
        }
      }
    } else {
      if (!forPreview) {
        if (isStandaloneResource) {
          url = `/apis/proxies/v8/action/content/v3/read/${contentId}`
        } else {
          url = `/apis/proxies/v8/action/content/v3/hierarchy/${contentId}?hierarchyType=${hierarchyType}`
        }
      } else {
        const forcreator = window.location.href.includes('editMode=true') || contentStatus === 'Draft' || contentStatus === 'Review'
        if (forcreator && !contentId.includes('_rc')) {
          url = `apis/proxies/v8/action/content/v3/hierarchy/${contentId}?mode=edit`
        } else if (forcreator && window.location.href.includes('multilingual')) {
          url = `apis/proxies/v8/action/content/v3/hierarchy/${contentId}?mode=edit`
        } else {
          if (contentId.includes('_rc')) {
            if (forcreator) {
              url = `apis/proxies/v8/action/content/v3/hierarchy/${contentId}?mode=edit`
            } else {
              url = `apis/proxies/v8/action/content/v3/hierarchy/${contentId}`
            }

          } else {
            url = `/api/course/v1/hierarchy/${contentId}?hierarchyType=${hierarchyType}`
          }
        }
      }
    }
    return this.http
      .get<NsContent.IContent>(url)
      .pipe(shareReplay(1))
  }

  getContentData(contentId: string): Observable<any> {
    return this.http.get<NsContent.IContent>(`${API_END_POINTS.CONTENT_READ(contentId)}`).pipe(
      map((data: any) => {
        return data.result.content
      }),
      retry(1))
  }

  getContentDataModeEdit(contentId: string): Observable<any> {
    return this.http.get<NsContent.IContent>(`${API_END_POINTS.CONTENT_READ(contentId)}?mode=edit`).pipe(
      map((data: any) => {
        return data?.result?.content
      }),
      retry(1))
  }

  isResource(primaryCategory: string) {
    if (primaryCategory) {
      const isResource = (primaryCategory === NsContent.EResourcePrimaryCategories.LEARNING_RESOURCE) ||
        (primaryCategory === NsContent.EResourcePrimaryCategories.PRACTICE_RESOURCE) ||
        (primaryCategory === NsContent.EResourcePrimaryCategories.FINAL_ASSESSMENT) ||
        (primaryCategory === NsContent.EResourcePrimaryCategories.COMP_ASSESSMENT) ||
        (primaryCategory === NsContent.EResourcePrimaryCategories.OFFLINE_SESSION)
      return isResource
    }
    return false
  }

  /*fetchAuthoringContent(contentId: string): Observable<NsContent.IContent> {
    const url = `${API_END_POINTS.PROXY_CONTENT}/hierarchy/${contentId}?mode=edit`
    return this.http.get<NsContent.IContent>(url).pipe(
      map((data: any) => {
        return data.result.content
      }),
      retry(1))
  } */

  fetchAuthoringContent(contentId: string): Observable<NsContent.IContent> {
    const url = `${API_END_POINTS.PROXY_CONTENT}hierarchy/${contentId}?mode=edit`
    return this.http.get<NsContent.IContent>(url).pipe(
      map((data: any) => {
        return data.result.content
      }),
      retry(1))
  }
  fetchAuthoringContentForLive(contentId: string): Observable<NsContent.IContent> {
    const url = `${API_END_POINTS.PROXY_CONTENT}hierarchy/${contentId}`
    return this.http.get<NsContent.IContent>(url).pipe(
      map((data: any) => {
        return data.result.content
      }),
      retry(1))
  }
  fetchAuthoringContentForLive2(contentId: string): Observable<NsContent.IContent> {
    const url = `${API_END_POINTS.PROXY_CONTENT}read/${contentId}`
    return this.http.get<NsContent.IContent>(url).pipe(
      map((data: any) => {
        return data.result.content
      }),
      retry(1))
  }
  fetchLearners(batchId: string): Observable<any[]> {
    const url = `${API_END_POINTS.ACTIVE_LEARNERS(batchId)}`
    return this.http.get<any[]>(url).pipe(retry(1))
  }

  fetchLearnersList(batchID: string, pageLimit: number = 10, offsetNum: number = 0): Observable<any> {
    const reqBody = {
      request: {
        filters: {
          active: true,
          batchId: batchID,
          limit: pageLimit,
          currentOffSet: offsetNum,
        },
      },
    }
    return this.http.post<any>(API_END_POINTS.ADMIN_ACTIVE_LEARNERS_LIST, reqBody).pipe(retry(1))
  }

  fetchProgress(req: any): Observable<any[]> {
    return this.http.post<any>(`${API_END_POINTS.ATTENDANCE_PROGRESS}`, req)
  }

  downloadQRCode(courseId: string, batchId: string) {
    const url = `${API_END_POINTS.DOWNLOAD_SESSION_QR_CODES(courseId, batchId)}`
    return this.http.get(url, { responseType: 'blob' })
  }

  fetchBlendedRequests(req: any): Observable<any[]> {
    return this.http.post<any>(API_END_POINTS.BLENDED_REQUESTS, req)
  }

  fetchBlendedSearchList(req: any): Observable<any[]> {
    return this.http.post<any>(API_END_POINTS.BLEMDED_SEARCH_REQUEST, req)
  }

  updateBlendedRequests(req: any) {
    return this.http.post<any>(`${API_END_POINTS.UPDATE_BLENDED_REQUEST}`, req)
  }

  removeLearner(req: any) {
    const headers = new HttpHeaders({
      "isPc": "true"
    })
    return this.http.post<any>(`${API_END_POINTS.REMOVE_BLENDED_REQUEST}`, req, { headers })
  }
  fetchContentData(identifier: string): Observable<NsContent.IContent> {
    const url = `${API_END_POINTS.AUTHORING_CONTENT(identifier)}`
    return this.http.get<NsContent.IContent>(url).pipe(
      map((data: NsContent.IContent) => {
        return data.result.content
      }),
      retry(1))
  }
  fetchAuthoringContentHierarchy(contentId: string): Observable<NsContent.IContent> {
    const url = `${API_END_POINTS.AUTHORING_CONTENT_HIERARCHY(contentId)}`
    return this.http.get<NsContent.IContent>(url).pipe(retry(1))
  }
  fetchAuthoringContentHierarchyWithoutEdit(contentId: string): Observable<NsContent.IContent> {
    const url = `${API_END_POINTS.AUTHORING_CONTENT_HIERARCHY_WITHOUT_EDIT(contentId)}`
    return this.http.get<NsContent.IContent>(url).pipe(retry(1))
  }
  fetchMultipleContent(ids: string[]): Observable<NsContent.IContent[]> {
    return this.http.get<NsContent.IContent[]>(
      `${API_END_POINTS.MULTIPLE_CONTENT}/${ids.join(',')}`,
    )
  }
  fetchCollectionHierarchy(type: string, id: string, pageNumber: number = 0, pageSize: number = 1) {
    return this.http.get<NsContent.ICollectionHierarchyResponse>(
      `${API_END_POINTS.COLLECTION_HIERARCHY(
        type,
        id,
      )}?pageNumber=${pageNumber}&pageSize=${pageSize}`,
    )
  }

  fetchContentLikes(contentIds: { content_id: string[] }) {
    return this.http
      .post<{ [identifier: string]: number }>(API_END_POINTS.CONTENT_LIKES, contentIds)
      .toPromise()
  }
  // fetchContentRatings(contentIds: { contentIds: string[] }) {
  //   return this.http
  //     .post(`${API_END_POINTS.CONTENT_RATING}/rating`, contentIds)
  //     .toPromise()
  // }
  // fetchContentRatingsV2(contentId: string) {
  //   return this.http
  //     .get<IContentRating>(`${API_END_POINTS.CONTENT_RATING_V2}/${contentId}`)
  // }
  getRating(contentId: string, contentType: string, userId: string): Observable<any> {
    return this.http.get<any>(
      API_END_POINTS.GET_RATING(contentId, contentType, userId)
    )
  }
  getRatingSummary(contentId: string, contentType: string): Observable<any> {
    return this.http.get<any>(
      API_END_POINTS.GET_RATING_SUMMARY(contentId, contentType)
    )
  }
  getRatingLookup(req: NsContent.ILookupRequest): Observable<any> {
    return this.http.post<any>(
      API_END_POINTS.GET_RATING_LOOKUP, req
    )
  }
  fetchContentHistory(_contentId: string): Observable<NsContent.IContinueLearningData> {
    return EMPTY
    // return this.http.get<NsContent.IContinueLearningData>(
    //   `${API_END_POINTS.CONTENT_HISTORY}/${contentId}`,
    // )
  }

  async continueLearning(id: string, collectionId?: string, collectionType?: string): Promise<any> {
    return new Promise(async resolve => {
      if (collectionType &&
        collectionType.toLowerCase() === 'playlist') {
        const reqBody = {
          contextPathId: collectionId ? collectionId : id,
          resourceId: id,
          data: JSON.stringify({
            timestamp: Date.now(),
            contextFullPath: [collectionId, id],
          }),
          dateAccessed: Date.now(),
          contextType: 'playlist',
        }
        await this.saveContinueLearning(reqBody).toPromise().catch().finally(() => {
          resolve(true)
        })
      } else {
        const reqBody = {
          contextPathId: collectionId ? collectionId : id,
          resourceId: id,
          data: JSON.stringify({ timestamp: Date.now() }),
          dateAccessed: Date.now(),
        }
        await this.saveContinueLearning(reqBody).toPromise().catch().finally(() => {
          resolve(true)
        })
      }
    })
  }
  saveContinueLearning(_content: NsContent.IViewerContinueLearningRequest): Observable<any> {
    // const url = API_END_POINTS.USER_CONTINUE_LEARNING
    return EMPTY
  }

  setS3Cookie(
    contentId: string,
    // _path: string,
  ): Observable<any> {
    return this.http
      .post(API_END_POINTS.SET_S3_COOKIE, { contentId })
      .pipe(catchError(_err => of(true)))
  }

  // setS3ImageCookie(): Observable<any> {
  //   return this.http.post(API_END_POINTS.SET_S3_IMAGE_COOKIE, {}).pipe(catchError(_err => of(true)))
  // }

  fetchManifest(url: string): Observable<any> {
    return this.http.post(API_END_POINTS.FETCH_MANIFEST, { url })
  }
  fetchWebModuleContent(url: string): Observable<any> {
    return this.http.get(`${API_END_POINTS.FETCH_WEB_MODULE_FILES}?url=${encodeURIComponent(url)}`)
  }
  search(req: NSSearch.ISearchRequest): Observable<NSSearch.ISearchApiResult> {
    req.query = req.query || ''
    return this.http.post<NSSearch.ISearchApiResult>(API_END_POINTS.CONTENT_SEARCH_V5, {
      request: req,
    })
  }
  searchRegionRecommendation(
    req: NSSearch.ISearchOrgRegionRecommendationRequest,
  ): Observable<NsContentStripMultiple.IContentStripResponseApi> {
    req.query = req.query || ''
    req.preLabelValue =
      (req.preLabelValue || '') +
      ((this.configSvc.userProfile && this.configSvc.userProfile.country) || '')
    req.filters = {
      ...req.filters,
      labels: [req.preLabelValue || ''],
    }
    return this.http.post<NsContentStripMultiple.IContentStripResponseApi>(
      API_END_POINTS.CONTENT_SEARCH_REGION_RECOMMENDATION,
      { request: req },
    )
  }
  searchV6(req: NSSearch.ISearchV6Request): Observable<NSSearch.ISearchV6ApiResult> {
    req.query = req.query || ''
    return this.http.post<NSSearch.ISearchV6ApiResult>(API_END_POINTS.CONTENT_SEARCH_V6, req)
  }

  fetchContentRating(contentId: string): Observable<{ rating: number }> {
    return this.http.get<{ rating: number }>(`${API_END_POINTS.CONTENT_RATING}/${contentId}`)
  }
  deleteContentRating(contentId: string): Observable<any> {
    return this.http.delete(`${API_END_POINTS.CONTENT_RATING}/${contentId}`)
  }
  addContentRating(contentId: string, data: { rating: number }): Observable<any> {
    return this.http.post<any>(`${API_END_POINTS.CONTENT_RATING}/${contentId}`, data)
  }

  async getFirstChildInHierarchy(content: NsContent.IContent): Promise<NsContent.IContent> {
    if (!(content.children || []).length) {
      return content
    }
    if (
      (content.primaryCategory === NsContent.EPrimaryCategory.PROGRAM ||
        content.primaryCategory === NsContent.EPrimaryCategory.CURATED_PROGRAM ||
        content.primaryCategory === NsContent.EPrimaryCategory.BLENDED_PROGRAM
      )
    ) {
      if (content.children && content.children.length > 0 &&
        content.children[0].primaryCategory === NsContent.EPrimaryCategory.COURSE
      ) {
        const resData =
          await this.fetchAuthoringContentHierarchyWithoutEdit(content.children[0].identifier).toPromise().catch(_error => { })
        if (resData && resData.params && resData.params.status && resData.params.status === 'successful') {
          return this.getFirstChildInHierarchy(resData.result.content)
        }
      }
      return this.getFirstChildInHierarchy(content.children[0])
    }
    if (
      content.primaryCategory === NsContent.EPrimaryCategory.RESOURCE ||
      content.primaryCategory === NsContent.EPrimaryCategory.ASSESSMENT ||
      content.primaryCategory === NsContent.EPrimaryCategory.FINALASSESSMENT
    ) {
      return content
    }
    const firstChild = content.children[0]
    const resultContent = this.getFirstChildInHierarchy(firstChild)
    return resultContent
  }

  getRegistrationStatus(source: string): Promise<{ hasAccess: boolean; registrationUrl?: string }> {
    return this.http.get<any>(`${API_END_POINTS.REGISTRATION_STATUS}/${source}`).toPromise()
  }

  fetchConfig(url: string) {
    return this.http.get<any>(url)
  }
  getRatingIcon(ratingIndex: number, avg: number): 'star' | 'star_border' | 'star_half' {
    if (avg) {
      const avgRating = avg
      const ratingFloor = Math.floor(avgRating)
      // const difference =  avgRating - ratingIndex
      if (ratingIndex <= ratingFloor) {
        return 'star'
      }
      if (ratingFloor === ratingIndex - 1 && avgRating % 1 >= 0.29 && avgRating % 1 < 0.71) {
        return 'star_half'
      }
    }
    return 'star'
  }

  getRatingIconClass(ratingIndex: number, avg: number): boolean {
    if (avg) {
      const avgRating = avg
      const ratingFloor = Math.floor(avgRating)
      if (ratingIndex <= ratingFloor) {
        return true
      }
      if (ratingFloor === ratingIndex - 1 && avgRating % 1 >= 0.29 && avgRating % 1 < 0.71) {
        return true
      }
      if (ratingFloor === ratingIndex - 1 && avgRating % 1 > 0.71) {
        return true
      }
      if (ratingFloor === ratingIndex - 1 && avgRating % 1 < 0.29) {
        return false
      }
    }
    return false
  }

  markAttendence(req: any) {
    return this.http.post<any>(`${API_END_POINTS.MARK_ATTENDENCE}`, req)
  }

  updateTocConfig(data: any) {
    this.tocConfigData.next(data)
  }

  fetchExtUserContentEnroll(contentId: string) {
    return this.http.get<any>(API_END_POINTS.EXT_USER_COURSE_ENROLL(contentId))
  }

  fetchExternalContent(contentId: string[]): Observable<NsContent.IContent[]> {
    return this.http.get<NsContent.IContent[]>(API_END_POINTS.EXT_CONTENT_READ(contentId))
  }

  fetchExternalPublicContent(partenerName: any, contentId: any): Observable<NsContent.IContent[]> {
    return this.http.get<NsContent.IContent[]>(API_END_POINTS.EXT_PUBLIC_CONTENT(partenerName, contentId))
  }

  fetchCourseBatches(req: any): Observable<NsContent.IBatchListResponse> {
    return this.http
      .post<NsContent.IBatchListResponse>(API_END_POINTS.COURSE_BATCH_LIST, req)
      .pipe(
        retry(1),
        map(
          (data: any) => data.result.response
        )
      )
  }

  // fetch individual batch
  fetchCourseBatch(batchId: string): Observable<NsContent.IContinueLearningData> {
    return this.http.get<NsContent.IContinueLearningData>(
      `${API_END_POINTS.COURSE_BATCH}/${batchId}`,
    )
  }

  fetchContentHistoryV2(req: NsContent.IContinueLearningDataReq): Observable<NsContent.IContinueLearningData> {
    req.request.fields = ['progressdetails']
    const data = this.http.post<NsContent.IContinueLearningData>(
      `${API_END_POINTS.CONTENT_HISTORYV2}/${req.request.courseId}`, req
    )
    // data.subscribe((subscribeData: any) => {
    //       this.programChildCourseResumeData.next({ resumeData: subscribeData.result.contentList, courseId: req.request.courseId })
    //     })
    return data
  }

  setProgramChildResumeData(contentList: any, courseId: any) {
    /* tslint:disable */
    this.programChildCourseResumeData.next({ resumeData: contentList, courseId })
    /* tslint:enable */
  }

  autoAssignBatchApi(identifier: any): Observable<NsContent.IBatchListResponse> {
    return this.http.get<NsContent.IBatchListResponse>(`${API_END_POINTS.AUTO_ASSIGN_BATCH}${identifier}`)
      .pipe(
        retry(1),
        map(
          (data: any) => data.result.response
        )
      )
  }

  autoAssignCuratedBatchApi(request: any, programType: any): Observable<NsContent.IBatchListResponse> {
    const url = programType === NsContent.ECourseCategory.MODERATED_PROGRAM ?
      API_END_POINTS.AUTO_ASSIGN_OPEN_PROGRAM : API_END_POINTS.AUTO_ASSIGN_CURATED_BATCH
    return this.http.post<NsContent.IBatchListResponse>(`${url}`, request)
      .pipe(
        retry(1),
        map(
          (data: any) => data.result.response
        )
      )
  }

  fetchBlendedUserWF(req: any) {
    return this.http
      .post(API_END_POINTS.BLENDED_USER_WF, req)
      .toPromise()
  }

  enrollUserToBatch(req: any) {
    return this.http
      .post(API_END_POINTS.ENROLL_BATCH, req)
      .toPromise()
  }

  getCourseKarmaPoints(request: any) {
    return this.http.post<any>(API_END_POINTS.READ_COURSE_KARMAPOINTS, request)
  }

  claimKarmapoints(request: any) {
    return this.http.post<any>(API_END_POINTS.CLAIM_KARMAPOINTS, request)
  }

  fetchBlendedUserCOUNT(req: any) {
    return this.http
      .post(API_END_POINTS.BLENDED_USER_COUNT, req)
      .toPromise()
  }

  userKarmaPoints() {
    return this.http.post<any>(API_END_POINTS.USER_KARMA_POINTS, {})
  }

  enrollAndUnenrollUserToBatchWF(req: any, type: any) {
    const url: any = type === 'WITHDRAW' ? API_END_POINTS.WITHDRAW_BATCH_WF : API_END_POINTS.ENROLL_BATCH_WF
    return this.http
      .post(url, req)
      .toPromise()
  }

  async getResourseLink(content: any) {
    const enrolledCourseData: any = this.getEnrolledData(content.identifier)
    if (enrolledCourseData) {
      if (enrolledCourseData && enrolledCourseData.content && enrolledCourseData.content.status &&
        enrolledCourseData.content.status.toLowerCase() !== 'retired') {
        if (enrolledCourseData.content.courseCategory === NsContent.ECourseCategory.BLENDED_PROGRAM ||
          enrolledCourseData.content.courseCategory === NsContent.ECourseCategory.INVITE_ONLY_PROGRAM ||
          enrolledCourseData.content.courseCategory === NsContent.ECourseCategory.MODERATED_PROGRAM ||
          enrolledCourseData.content.primaryCategory === NsContent.EPrimaryCategory.BLENDED_PROGRAM ||
          enrolledCourseData.content.primaryCategory === NsContent.EPrimaryCategory.PROGRAM) {
          if (!this.isBatchInProgress(enrolledCourseData.batch)) {
            return this.gotoTocPage(content)
          }
          const returnData = await this.checkForDataToFormUrl(content, enrolledCourseData)
          return returnData
        }
        const data = await this.checkForDataToFormUrl(content, enrolledCourseData)
        return data
      }
      return ''
    }
    return this.gotoTocPage(content)
  }

  getEnrolledData(doId: string) {
    const enrollmentMapData = JSON.parse(localStorage.getItem('enrollmentMapData') || '{}')
    const enrolledCourseData = enrollmentMapData[doId]
    return enrolledCourseData
  }

  gotoTocPage(content: any) {
    const urlData: any = {
      url: `/app/toc/${content.identifier ? content.identifier : content.collectionId}/overview`,
      queryParams: { batchId: content.batchId },
    }
    if (content.endDate) {
      urlData.queryParams = { ...urlData.queryParams, planType: 'cbPlan', endDate: content.endDate }
    }
    if (content.contentId && content.contentId.includes('ext_')) {
      urlData.url = `/app/toc/ext/${content.contentId}`
      urlData.queryParams = {}
    }
    return urlData
  }

  async checkForDataToFormUrl(content: any, enrollData: any) {
    let urlData: any
    if (enrollData.completionPercentage === 100) {
      return this.gotoTocPage(enrollData)
    }
    // if (enrollData.lrcProgressDetails && enrollData.lrcProgressDetails.mimeType) {
    //   const modifyEnrollData  = {
    //     ...enrollData,
    //     identifier: enrollData.collectionId,
    //     primaryCategory: enrollData.content.primaryCategory,
    //     name: enrollData.content.name,
    //   }
    //   if (modifyEnrollData.lastReadContentId) {
    //     return this.getResourseDataWithData(modifyEnrollData,
    //                                         enrollData.lastReadContentId, enrollData.lrcProgressDetails.mimeType)
    //   }
    //   if (modifyEnrollData.firstChildId) {
    //     return this.getResourseDataWithData(modifyEnrollData,
    //                                         enrollData.firstChildId,
    //                                         enrollData.lrcProgressDetails.mimeType)
    //   }
    // }
    if (enrollData.lastReadContentId || enrollData.firstChildId) {
      const doId = enrollData.lastReadContentId || enrollData.firstChildId
      const responseData = await this.fetchProgramContent(doId).toPromise().then(async (res: any) => {
        if (res && res.result && res.result.content) {
          const contentData: any = res.result.content
          const modifyEnrollData = {
            ...enrollData,
            identifier: enrollData.collectionId,
            primaryCategory: enrollData.content.primaryCategory,
            name: enrollData.content.name,
          }
          urlData = this.getResourseDataWithData(modifyEnrollData, contentData.identifier, contentData.mimeType)
          if (urlData) {
            return urlData
          }
        }
      })
      return responseData ? responseData : this.gotoTocPage(content)
    }
    return this.gotoTocPage(content)

  }

  isBatchInProgress(batchData: any) {
    // if (this.content && this.content['batches']) {
    // const batches = this.content['batches'] as NsContent.IBatch
    if (batchData && batchData.endDate) {
      const now = moment().format('YYYY-MM-DD')
      const startDate = moment(batchData.startDate).format('YYYY-MM-DD')
      const endDate = batchData.endDate ? moment(batchData.endDate).format('YYYY-MM-DD') : now
      return (
        // batch.status &&
        moment(startDate).isSameOrBefore(now)
        && moment(endDate).isSameOrAfter(now)
      )
    } return true
  }

  fetchProgramContent(contentId: string[]): Observable<NsContent.IContent[]> {
    let url = ''
    const forPreview = window.location.href.includes('/public/') || window.location.href.includes('&preview=true') ||
      window.location.href.includes('&status=Draft')
    if (!forPreview) {
      return this.http.get<NsContent.IContent[]>(
        API_END_POINTS.CONTENT_READ(contentId),
      )
    }
    if (window.location.href.includes('editMode=true')) {
      url = `/apis/proxies/v8/action/content/v3/read/${contentId}`
    } else {
      url = `/api/content/v1/read/${contentId}`
    }
    return this.http.get<NsContent.IContent[]>(url)
    // return this.http.get<NsContent.IContent[]>(API_END_POINTS.CONTENT_READ(contentId))
  }
  getResourseDataWithData(content: any, resourseId: any, mimeType: any) {
    if (content) {
      const url = viewerRouteGenerator(
        resourseId,
        mimeType,
        content.identifier,
        'Course',
        false,
        'Learning Resource',
        content.batchId,
      )
      return url
    }
    return this.gotoTocPage(content)
  }

  getPreAssessmentFirstChildInHierarchy(content: NsContent.IContent): NsContent.IContent {
    if (!(content.children || []).length) {
      return content
    }
    if (
      (content.primaryCategory === NsContent.EPrimaryCategory.PROGRAM &&
        !(content.artifactUrl && content.artifactUrl.length)) ||
      content.primaryCategory === NsContent.EPrimaryCategory.MANDATORY_COURSE_GOAL ||
      (content.primaryCategory === NsContent.EPrimaryCategory.BLENDED_PROGRAM &&
        !(content.artifactUrl && content.artifactUrl.length)) ||
      (content.primaryCategory === NsContent.EPrimaryCategory.MODULE &&
        !(content.artifactUrl && content.artifactUrl.length))
    ) {
      const child = content.children[0]
      return this.getPreAssessmentFirstChildInHierarchy(child)
    }
    if (
      content.primaryCategory === NsContent.EPrimaryCategory.RESOURCE ||
      content.primaryCategory === NsContent.EPrimaryCategory.KNOWLEDGE_ARTIFACT ||
      content.primaryCategory === NsContent.EPrimaryCategory.PROGRAM ||
      content.primaryCategory === NsContent.EPrimaryCategory.PRACTICE_RESOURCE ||
      content.primaryCategory === NsContent.EPrimaryCategory.FINAL_ASSESSMENT ||
      content.primaryCategory === NsContent.EPrimaryCategory.COMP_ASSESSMENT ||
      content.primaryCategory === NsContent.EPrimaryCategory.BLENDED_PROGRAM ||
      content.primaryCategory === NsContent.EPrimaryCategory.OFFLINE_SESSION
    ) {
      return content
    }
    const firstChild = content.children[0]
    const resultContent = this.getPreAssessmentFirstChildInHierarchy(firstChild)
    return resultContent
  }

  getAssignmentStatus(request: any): Observable<any> {
    return this.http.post(`${API_END_POINTS.ASSIGNMENT_STATUS}`, request)
  }

  submitAssignmentFeedback(request: any): Observable<any> {
    return this.http.post(`${API_END_POINTS.ASSIGNMENT_FEEDBACK}`, request)
  }


  readAssignmentFile(contentId: string, batchId: string, assignmentId: string, fileName: string): Observable<any> {
    // Properly encode the parameters to avoid malformed request errors
    const encodedParams = new URLSearchParams({
      contentId: contentId || '',
      batchId: batchId || '',
      formId: assignmentId || '',
      fileName: fileName || ''
    })

    return this.http.get(`${API_END_POINTS.READ_ASSIGNMENT}?${encodedParams.toString()}`, {
      responseType: 'blob',
      headers: {
        'Accept': 'application/octet-stream, application/pdf, application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      }
    }).pipe(
      catchError((error: any) => {
        return throwError(() => error)
      })
    )
  }

  notifyAssignmentUpload(payload: any): Observable<any> {
    return this.http.post(`${API_END_POINTS.NOTIFY_FEEDBACK_SUBMISSION}`, payload)
  }



}
