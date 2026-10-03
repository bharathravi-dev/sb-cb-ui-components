import { Component, Input, OnInit, OnDestroy, Renderer2, SimpleChanges, ChangeDetectorRef } from '@angular/core'
import { NsContent } from '../../../../_services/widget-content.model'
import { viewerRouteGenerator } from '../../../../_services/viewer-route-util'
import { NsAppToc } from '../../../../models/app-toc.model'
import { EventService, WsEvents, ConfigurationsService } from '@sunbird-cb/utils-v2'
import { CertificateDialogComponent } from '../../certificate-dialog/certificate-dialog.component'
import { MatDialog as MatDialog } from '@angular/material/dialog'
import { animate, style, transition, trigger } from '@angular/animations'
/* tslint:disable*/
import _ from 'lodash'
import moment from 'moment'
import { CertificateService } from '../../../../services/certificate.service'
import { AppTocService } from '../../../../services/app-toc.service'
import { Subscription } from 'rxjs'
import { ContentLanguageService } from '@sunbird-cb/consumption'
import { ResourceDownloadHelperService } from '../../../../services/resource-download-helper.service'
import { MatSnackBar as MatSnackBar } from '@angular/material/snack-bar'

@Component({
  selector: 'ws-widget-app-toc-content-card-v2',
  templateUrl: './app-toc-content-card-v2.component.html',
  styleUrls: ['./app-toc-content-card-v2.component.scss'],
  animations: [
    trigger('panelInOut', [
      transition('void => *', [
        style({ transform: 'translateY(-10%)', opacity: '0' }),
        animate(250)
      ]),
      transition('* => void', [
        animate(200, style({ transform: 'translateY(-10%)', opacity: '0' }))
      ])
    ])
  ],
  standalone: false
})
export class AppTocContentCardV2Component implements OnInit, OnDestroy {
  @Input() content: NsContent.IContent | null = null
  @Input() expandAll = false
  @Input() rootId!: string
  @Input() rootContentType!: string
  @Input() forPreview = false
  @Input() batchId!: string
  @Input() componentName: string = 'toc'
  @Input() index!: number
  @Input() pathSet!: any
  @Input() expandActive = true
  @Input() hierarchyMapData: any = {}
  @Input() batchData: /**NsContent.IBatchListResponse */ any | null = null
  @Input() isPreAssessment = false
  @Input() baseContentReadData: NsContent.IContent | null = null
  @Input() mlCourse: NsContent.IContent | null = null
  @Input() isUserunEnrolled = false
  @Input() parentMilestoneLocked = false // Passed from parent when inside a locked milestone
  hasContentStructure = false
  downloadCertificateLoading = false
  enumContentTypes = NsContent.EDisplayContentTypes
  color = 'blue'
  contentStructure: NsAppToc.ITocStructure = {
    assessment: 0,
    finalTest: 0,
    course: 0,
    handsOn: 0,
    interactiveVideo: 0,
    learningModule: 0,
    other: 0,
    pdf: 0,
    survey: 0,
    podcast: 0,
    practiceTest: 0,
    quiz: 0,
    video: 0,
    webModule: 0,
    webPage: 0,
    youtube: 0,
    interactivecontent: 0,
    offlineSession: 0,
  }
  defaultThumbnail = ''
  viewChildren = false
  primaryCategory = NsContent.EPrimaryCategory
  pageScrollSubscription: Subscription | null = null
  hashmapUpdatedSubscription: Subscription | null = null
  achievementLoading: boolean = false
  // Cached computed properties for performance optimization
  private _cachedIsCollection: boolean = false
  private _cachedIsModule: boolean = false
  private _cachedIsResource: boolean = false
  private _cachedIsMilestone: boolean = false
  // IMPORTANT: Default to TRUE (locked) - milestones should be locked until explicitly unlocked
  private _cachedIsMilestoneLocked: boolean = true
  private _cachedIsParentMilestoneLocked: boolean = false
  private _cachedIsContentUnlocked: boolean = true
  private _cachedCheckForCuratedProgram: boolean = false
  private _cachedIsMilestoneAssessment: boolean = false
  private _cachedIsMilestoneAssessmentLocked: boolean = false
  private _cachedResourceLink: { url: string; queryParams: { [key: string]: any } } = { url: '', queryParams: {} }
  private _cachedMilestoneCompletedCount: number = 0
  private _cacheInitialized: boolean = false

  constructor(
    private events: EventService,
    private dialog: MatDialog,
    private renderer: Renderer2,
    private certificateService: CertificateService,
    private appTocSvc: AppTocService,
    private contentLangSvc: ContentLanguageService,
    private resourceDownloadHelperSvc: ResourceDownloadHelperService,
    private configSvc: ConfigurationsService,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit() {
    this.evaluateImmediateChildrenStructure()
    this.initializeComputedProperties()
    // this.route.data.subscribe(data => {
    //     this.defaultThumbnail = data.configData.data.logos.defaultContent
    //   }
    // )
    this.resourceScroll()

    // Subscribe to hashmap updates to recompute cached properties when progress changes
    this.hashmapUpdatedSubscription = this.appTocSvc.hashmapUpdated$.subscribe((update) => {
      if (update && update.hashmap) {
        // IMPORTANT: Update hierarchyMapData with the latest hashmap from the service
        // This ensures the component uses the updated data, not the stale @Input reference
        this.hierarchyMapData = update.hashmap
        const prevLockState = this._cachedIsMilestoneLocked
        this.computeAllCachedProperties()
        // Force Angular change detection to update the view
        this.cdr.detectChanges()
      }
    })
  }

  /**
   * Initialize all computed properties once to avoid expensive getter calculations
   * on every change detection cycle
   */
  private initializeComputedProperties() {
    this.computeAllCachedProperties()
  }

  /**
   * Compute all cached properties at once for performance optimization
   */
  private computeAllCachedProperties() {
    if (!this.content) {
      this._cacheInitialized = false
      return
    }

    const contentId = this.content.identifier
    const hashData = this.hierarchyMapData && this.hierarchyMapData[contentId]

    // Use hashmap data if available for pre-computed values
    if (hashData) {
      this._cachedIsCollection = hashData.isCollection !== undefined ?
        hashData.isCollection : this.content.mimeType === NsContent.EMimeTypes.COLLECTION
      this._cachedIsModule = hashData.isModule !== undefined ?
        hashData.isModule : this.content.primaryCategory === NsContent.EPrimaryCategory.MODULE
      this._cachedIsResource = hashData.isResource !== undefined ?
        hashData.isResource : this.computeIsResource()
      this._cachedIsMilestone = hashData.isMilestone !== undefined ?
        hashData.isMilestone : this.computeIsMilestone()
      this._cachedIsMilestoneLocked = hashData.computedIsLocked !== undefined ?
        hashData.computedIsLocked : this.computeIsMilestoneLocked()
      this._cachedIsParentMilestoneLocked = hashData.isParentMilestoneLocked !== undefined ?
        hashData.isParentMilestoneLocked : this.computeIsParentMilestoneLocked()
    } else {
      // Fallback to direct computation if hashmap not available
      this._cachedIsCollection = this.content.mimeType === NsContent.EMimeTypes.COLLECTION
      this._cachedIsModule = this.content.primaryCategory === NsContent.EPrimaryCategory.MODULE
      this._cachedIsResource = this.computeIsResource()
      this._cachedIsMilestone = this.computeIsMilestone()
      this._cachedIsMilestoneLocked = this.computeIsMilestoneLocked()
      this._cachedIsParentMilestoneLocked = this.computeIsParentMilestoneLocked()
    }

    this._cachedCheckForCuratedProgram = this.computeCheckForCuratedProgram()
    this._cachedIsContentUnlocked = this.computeIsContentUnlocked()
    this._cachedIsMilestoneAssessment = this.computeIsMilestoneAssessment()
    this._cachedIsMilestoneAssessmentLocked = this.computeIsMilestoneAssessmentLocked()
    this._cachedResourceLink = this.computeResourceLink()
    this._cachedMilestoneCompletedCount = this.computeMilestoneCompletedCount()
    this._cacheInitialized = true
  }

  private computeIsResource(): boolean {
    if (!this.content) return false
    return (
      this.content.primaryCategory === NsContent.EPrimaryCategory.RESOURCE ||
      this.content.primaryCategory === NsContent.EPrimaryCategory.PRACTICE_RESOURCE ||
      this.content.primaryCategory === NsContent.EPrimaryCategory.FINAL_ASSESSMENT ||
      this.content.primaryCategory === NsContent.EPrimaryCategory.COMP_ASSESSMENT
    )
  }

  private computeIsMilestone(): boolean {
    if (!this.content) return false
    const primaryCat = this.content.primaryCategory as string
    const courseCat = this.content.courseCategory as string
    return primaryCat === 'Milestone' || courseCat === 'Milestone'
  }

  private computeCheckForCuratedProgram(): boolean {
    if (this.content && this.content.parent && this.hierarchyMapData && this.hierarchyMapData[this.content.parent]) {
      const parentData = this.hierarchyMapData[this.content.parent]
      return parentData && parentData.primaryCategory === NsContent.EPrimaryCategory.CURATED_PROGRAM &&
        parentData.compatibilityLevel >= 5 &&
        parentData.contextLockingType === NsContent.EContextLockingType.COURSE_ASSESSMENT_ONLY
    }
    return false
  }

  private computeIsContentUnlocked(): boolean {
    if (this._cachedCheckForCuratedProgram) {
      if (this.content && this.content.parent && this.hierarchyMapData && this.hierarchyMapData[this.content.parent]) {
        const parentData = this.hierarchyMapData[this.content.parent]
        let completedLeafNodes: any[] = []
        parentData.leafNodes.forEach((_ele: any) => {
          if (this.hierarchyMapData && this.hierarchyMapData[_ele]) {
            const childData = this.hierarchyMapData[_ele]
            if (childData && childData.completionStatus === 2) {
              completedLeafNodes.push(childData)
            }
          }
        })
        return completedLeafNodes.length >= parentData.leafNodesCount - 1
      }
      return false
    }
    return true
  }

  private computeResourceLink(): { url: string; queryParams: { [key: string]: any } } {
    if (this.content) {
      let mimeType: any = ''
      if (this.content && this.content.courseCategory === 'Pre Enrolment Assessment' &&
        this.content.mimeType === 'application/vnd.ekstep.content-collection'
      ) {
        mimeType = 'application/vnd.sunbird.questionset'
        this.content.mimeType = NsContent.EMimeTypes.FINAL_ASSESSMENT
      } else {
        mimeType = this.content.mimeType
      }
      const selectedLanguage = this.mlCourse ? this.contentLangSvc.getSelectedLanguage(this.mlCourse) : undefined
      return viewerRouteGenerator(
        this.content.identifier,
        mimeType,
        this.baseContentReadData?.identifier || this.rootId,
        this.baseContentReadData?.contentType || this.rootContentType,
        this.forPreview,
        this.content.primaryCategory,
        this.batchId,
        this.content?.name || this.baseContentReadData?.name,
        (selectedLanguage ? selectedLanguage.langId : null),
        (selectedLanguage ? selectedLanguage.identifier : null),
      )
    }
    return { url: '', queryParams: {} }
  }

  private computeIsMilestoneLocked(): boolean {
    // Only apply milestone locking for Learning Pathway content
    if (!this.baseContentReadData || this.baseContentReadData.courseCategory !== 'Learning Pathway') {
      return false
    }

    if (!this.content) {
      return false
    }

    // Check if current content is a Milestone
    if (!this._cachedIsMilestone && !this.computeIsMilestone()) {
      return false
    }

    // Check if hashmap has pre-computed locking status (preferred - computed by service)
    const hashData = this.hierarchyMapData && this.hierarchyMapData[this.content.identifier]


    // CRITICAL: Only use computedIsLocked from hashmap - this is the SINGLE SOURCE OF TRUTH
    // The service computes this value based on pre-assessment/milestone completion
    if (hashData && hashData.computedIsLocked !== undefined) {
      return hashData.computedIsLocked
    }

    // IMPORTANT: If no computedIsLocked value exists, default to LOCKED
    // This ensures milestones stay locked until the service explicitly unlocks them
    // DO NOT use this.content.isLocked as it may be false by default from API
    return true
  }

  private computeIsParentMilestoneLocked(): boolean {
    if (this.parentMilestoneLocked) {
      return true
    }

    if (!this.baseContentReadData || this.baseContentReadData.courseCategory !== 'Learning Pathway') {
      return false
    }

    if (!this.content || !this.hierarchyMapData) {
      return false
    }

    // Check hashmap for pre-computed value (set by computeMilestoneLockingStatus)
    const hashData = this.hierarchyMapData[this.content.identifier]
    if (hashData && hashData.isParentMilestoneLocked !== undefined) {
      return hashData.isParentMilestoneLocked
    }

    // Traverse up the hierarchy to find if any ancestor is a locked Milestone
    let currentParentId = this.content.parent
    const maxDepth = 5
    let depth = 0

    while (currentParentId && depth < maxDepth) {
      const parentData = this.hierarchyMapData[currentParentId]
      if (parentData) {
        // CRITICAL: Only check computedIsLocked (computed by service), NOT isLocked (API default)
        // isLocked from API may be false even when milestone should be locked
        if ((parentData.isMilestone || parentData.primaryCategory === 'Milestone' || parentData.courseCategory === 'Milestone') &&
          parentData.computedIsLocked === true) {
          return true
        }
        currentParentId = parentData.parent
      } else {
        break
      }
      depth++
    }
    return false
  }

  /**
   * Check if current content is a MILESTONE assessment (DIRECT child of a Milestone)
   * IMPORTANT: This should NOT return true for course assessments inside courses within milestones
   * Only assessments that are direct children of milestones should be locked by milestone logic
   */
  private computeIsMilestoneAssessment(): boolean {
    if (!this.baseContentReadData || this.baseContentReadData.courseCategory !== 'Learning Pathway') {
      return false
    }

    if (!this.content || !this.hierarchyMapData) {
      return false
    }

    // Check if this is an assessment type
    // Note: FINAL_ASSESSMENT maps to 'Course Assessment' in the enum, not 'Final Assessment'
    const isAssessment =
      this.content.primaryCategory === 'Course Assessment' ||
      this.content.primaryCategory === 'Standalone Assessment' ||
      this.content.mimeType === 'application/vnd.sunbird.questionset' ||
      this.content.mimeType === 'application/quiz'

    if (!isAssessment) {
      return false
    }

    // IMPORTANT: Only return true if the DIRECT parent is a milestone
    // Assessments inside courses (grandchildren of milestones) should NOT be locked by milestone logic
    // They follow their own course's locking rules

    // Get the parent from hashmap (which we fixed to track correct parent-child relationships)
    // or fallback to content.parent if hashmap entry doesn't exist
    const contentHashData = this.hierarchyMapData[this.content.identifier]
    const parentId = contentHashData?.parent || this.content.parent

    if (parentId && this.hierarchyMapData[parentId]) {
      const parentData = this.hierarchyMapData[parentId]



      // Check if DIRECT parent is a milestone - ONLY this case
      const isParentMilestone = parentData.isMilestone ||
        parentData.primaryCategory === 'Milestone' ||
        parentData.courseCategory === 'Milestone'

      if (isParentMilestone) {
        return true
      }

      // DO NOT check grandparent - course assessments inside courses within milestones
      // should NOT be treated as milestone assessments
      return false
    }

    return false
  }

  /**
   * Check if milestone assessment should be locked
   * Assessment is locked if:
   * 1. It's an assessment that is a DIRECT child of a milestone
   * 2. The parent milestone is unlocked (otherwise handled by parent milestone lock)
   * 3. NOT all mandatory courses in the same milestone are completed
   */
  private computeIsMilestoneAssessmentLocked(): boolean {
    // CRITICAL: Only apply milestone assessment locking for Learning Pathway content
    // Regular courses should NEVER have their assessments locked by milestone logic
    if (!this.baseContentReadData || this.baseContentReadData.courseCategory !== 'Learning Pathway') {
      return false
    }

    // Only apply to assessments that are DIRECT children of milestones
    const isMilestoneAssessment = this._cachedIsMilestoneAssessment || this.computeIsMilestoneAssessment()



    if (!isMilestoneAssessment) {
      return false
    }

    // Check if hashmap has pre-computed assessment locking status
    const hashData = this.hierarchyMapData && this.hierarchyMapData[this.content?.identifier || '']
    if (hashData && hashData.isAssessmentLocked !== undefined) {
      return hashData.isAssessmentLocked
    }

    // If already completed, don't lock
    if (this.content && (this.content.completionStatus === 2 ||
      (this.content.completionPercentage && this.content.completionPercentage >= 100))) {
      return false
    }

    // For milestone assessments, the parent IS the milestone (verified by computeIsMilestoneAssessment)
    // Use hashmap's parent which has correct parent-child relationships
    const contentHashData = this.hierarchyMapData && this.hierarchyMapData[this.content?.identifier || '']
    const milestoneId = contentHashData?.parent || this.content?.parent

    if (!milestoneId || !this.hierarchyMapData) {
      return false
    }

    const milestone = this.hierarchyMapData[milestoneId]

    if (!milestone) {
      return false
    }

    // If the parent milestone itself is locked, don't add additional locking
    // (the parent lock will handle it)
    if (milestone.computedIsLocked || milestone.isLocked) {
      return false
    }

    // Check if all mandatory COURSES in the milestone are completed
    // Note: Only checking courses that are direct children of the milestone
    let mandatoryCount = 0
    let completedMandatoryCount = 0

    for (const key of Object.keys(this.hierarchyMapData)) {
      const item = this.hierarchyMapData[key]

      // Only check items that are direct children of this milestone
      if (item.parent !== milestoneId) continue

      // Only count courses (not assessments, not other types)
      if (item.primaryCategory !== 'Course' && !item.isCollection) continue

      // Skip if this is an assessment
      const isItemAssessment =
        item.primaryCategory === 'Course Assessment' ||
        item.primaryCategory === 'Final Assessment' ||
        item.primaryCategory === 'Standalone Assessment' ||
        item.mimeType === 'application/vnd.sunbird.questionset'
      if (isItemAssessment) continue

      // By default, courses are mandatory unless explicitly marked as optional
      if (item.isMandatory !== false) {
        mandatoryCount++
        const isCompleted = item.completionStatus === 2 || item.status === 2 ||
          item.completionPercentage >= 100 || item.progress >= 100
        if (isCompleted) {
          completedMandatoryCount++
        }
      }
    }

    // If there are no mandatory courses, assessment is unlocked
    if (mandatoryCount === 0) {
      return false
    }

    // Lock assessment if not all mandatory courses are completed
    const allMandatoryComplete = completedMandatoryCount >= mandatoryCount
    return !allMandatoryComplete
  }

  // FOR RIGHT SIDE RESOURCE SCROLL ON TOC PAGE
  resourceScroll() {
    this.pageScrollSubscription = this.appTocSvc.updatePageScroll.subscribe((value: boolean) => {
      if (value) {
        setTimeout(() => {
          this.scrollView()
        }, 700)
      }
    })
  }
  // TO UPDATE RESOURCE BEHAVOUR SUBJECT FOR RESOURCE SCROLL
  changeResource() {
    this.appTocSvc.getPageScroll.next(true)
  }

  ngOnChanges(changes: SimpleChanges) {
    let shouldRecomputeCache = false

    for (const property in changes) {
      if (property === 'expandAll') {
        this.viewChildren = this.expandAll
      }
      if (property === 'pathSet' && changes['pathSet']) {
        let currentValue = changes['pathSet'].currentValue
        let previousValue = changes['pathSet'].previousValue
        if (currentValue && previousValue) {
          const eqSet = (xs: any, ys: any) =>
            xs.size === ys.size &&
            [...xs].every((x) => ys.has(x))
          if (!eqSet(previousValue, currentValue)) { }
        }
        // if(previousValue === undefined){
        //   setTimeout(()=>{
        //   },700)
        // }
      }
      // this.appTocSvc.getPageScroll.next(true)

      if (property === 'hierarchyMapData') {
        if (_.isEmpty(changes['hierarchyMapData'].currentValue)) {
          // this.loadingOverallPRogress = true
        } else {
          if (this.content) {
            this.updateChildParentMap(this.content.identifier)
          }
          shouldRecomputeCache = true
        }
      }

      // Recompute cache when critical inputs change
      if (property === 'content' || property === 'baseContentReadData' ||
        property === 'batchId' || property === 'forPreview' ||
        property === 'parentMilestoneLocked' || property === 'mlCourse') {
        shouldRecomputeCache = true
      }
    }

    // Recompute all cached properties if needed
    if (shouldRecomputeCache) {
      this.computeAllCachedProperties()
    }
  }

  check(content: any) {
    if (this.expandActive) {
      content.viewChildren = this.pathSet && this.pathSet.has(content.identifier) || content.viewChildren
    }
    return content.viewChildren
  }

  get isCollection(): boolean {
    if (this._cacheInitialized) {
      return this._cachedIsCollection
    }
    if (this.content) {
      return this.content.mimeType === NsContent.EMimeTypes.COLLECTION
    }
    return false
  }

  get isModule(): boolean {
    if (this._cacheInitialized) {
      return this._cachedIsModule
    }
    if (this.content) {
      return this.content.primaryCategory === NsContent.EPrimaryCategory.MODULE
    }
    return false
  }

  public checkModule(content: NsContent.IContent | null): boolean {
    if (content) {
      return content.primaryCategory === NsContent.EPrimaryCategory.MODULE
    }
    return false
  }

  checkIsModule(content: any): boolean {
    if (content) {
      return content.primaryCategory === NsContent.EPrimaryCategory.MODULE
    }
    return false
  }

  get isBatchInProgess() {
    if (this.batchData && (this.batchData.content && this.batchData.content.length) && this.batchData.enrolled) {
      const batchData = this.batchData.content[0]
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
    return false
  }

  get isResource(): boolean {
    if (this._cacheInitialized) {
      return this._cachedIsResource
    }
    return this.computeIsResource()
  }

  get resourceLink(): { url: string; queryParams: { [key: string]: any } } {
    if (this._cacheInitialized) {
      return this._cachedResourceLink
    }
    return this.computeResourceLink()
  }

  public progressColor(): string {
    // if (this.currentProgress <= 30) {
    //   return '#D13924'
    // } if (this.currentProgress > 30 && this.currentProgress <= 70) {
    //   return '#E99E38'
    // }
    // if (this.currentProgress > 70 && this.currentProgress <= 100) {
    //   return '#1D8923'
    // }

    return '#1D8923'
  }
  public progressColor2(): string {
    return '#f27d00'
  }

  private evaluateImmediateChildrenStructure() {
    if (this.content && this.content.children && this.content.children.length) {
      this.content.children.forEach((child: NsContent.IContent) => {
        if (child.primaryCategory === NsContent.EPrimaryCategory.COURSE) {
          this.contentStructure.course += 1
        } else if (child.primaryCategory === NsContent.EPrimaryCategory.KNOWLEDGE_ARTIFACT) {
          this.contentStructure.other += 1
        } else if (child.primaryCategory === NsContent.EPrimaryCategory.MODULE) {
          this.contentStructure.learningModule += 1
        } else if (child.primaryCategory === NsContent.EPrimaryCategory.OFFLINE_SESSION) {
          this.contentStructure.offlineSession += 1
        } else if (child.primaryCategory === NsContent.EPrimaryCategory.RESOURCE) {
          switch (child.mimeType) {
            case NsContent.EMimeTypes.HANDS_ON:
              this.contentStructure.handsOn += 1
              break
            case NsContent.EMimeTypes.MP3:
              this.contentStructure.podcast += 1
              break
            case NsContent.EMimeTypes.MP4:
            case NsContent.EMimeTypes.M3U8:
              this.contentStructure.video += 1
              break
            case NsContent.EMimeTypes.INTERACTION:
              this.contentStructure.interactiveVideo += 1
              break
            case NsContent.EMimeTypes.PDF:
              this.contentStructure.pdf += 1
              break
            case NsContent.EMimeTypes.OFFLINE_SESSION:
              this.contentStructure.offlineSession += 1
              break
            case NsContent.EMimeTypes.SURVEY:
              this.contentStructure.survey += 1
              break
            case NsContent.EMimeTypes.HTML:
              this.contentStructure.webPage += 1
              break
            case NsContent.EMimeTypes.QUIZ:
              if (child.resourceType === 'Assessment') {
                this.contentStructure.assessment += 1
              } else {
                this.contentStructure.quiz += 1
              }
              break
            case NsContent.EMimeTypes.PRACTICE_RESOURCE:
              // case NsContent.EMimeTypes.FINAL_ASSESSMENT:
              // case NsContent.EMimeTypes.PRACTICE_RESOURCE:
              this.contentStructure.practiceTest += 1
              break
            case NsContent.EMimeTypes.WEB_MODULE:
              this.contentStructure.webModule += 1
              break
            case NsContent.EMimeTypes.YOUTUBE:
              this.contentStructure.youtube += 1
              break
            default:
              this.contentStructure.other += 1
              break
          }
        }
      })
    }
    for (const key in this.contentStructure) {
      if (this.contentStructure[key] > 0) {
        this.hasContentStructure = true
      }
    }
  }

  get contextPath() {
    return {
      contextId: this.rootId,
      contextPath: this.rootContentType,
      batchId: this.batchId,
    }
  }

  public contentTrackBy(_index: number, content: NsContent.IContent) {
    if (!content) {
      return null
    }
    return content.identifier
  }

  public raiseTelemetry() {
    // if (this.forPreview) { return }
    if (this.content) {
      this.events.raiseInteractTelemetry(
        {
          type: 'click',
          subType: `card-tocContentCard`,
          // id: this.content.identifier || '',
        },
        {
          // contentId: this.content.identifier || '',
          // contentType: this.content.primaryCategory,
          id: this.content.identifier || '',
          type: this.content.primaryCategory,
          rollup: {
            l1: this.rootId || '',
          },
          ver: `${this.content.version}${''}`,
        },
        {
          pageIdExt: `${_.camelCase(this.content.primaryCategory)}-card`,
          module: _.camelCase(this.content.primaryCategory),
        })
    }
  }
  get isAllowed(): boolean {
    if (this.content) {
      return !(NsContent.UN_SUPPORTED_DATA_TYPES_FOR_NON_BATCH_USERS.indexOf(this.content.mimeType) >= 0)
    } return false
  }

  get isEnabled(): boolean {
    return true
  }

  get isEnrolled(): boolean {
    // Check both batchId and batchData.enrolled to support Learning Pathways
    // where batchId might not be directly set but user is enrolled in courses within the pathway
    return this.batchId ? true : (this.batchData?.enrolled || false)
  }

  updateChildParentMap(identifier: string) {
    if (this.hierarchyMapData && this.hierarchyMapData[identifier]) {
      let localContentData = this.hierarchyMapData[identifier]
      // Pre-enrolment rows (blended program pre-assessment list) get their progress
      // written directly on the row id by the pre-enrollment state-read and realtime
      // updates; their leafNodes are not tracked in the hashmap, so recomputing from
      // leafNodes would reset a completed row (e.g. the pre-enrolment assessment) to 0
      if (this.isPreAssessment) {
        return this.hierarchyMapData[identifier]
      }
      if (
        !(localContentData.primaryCategory === NsContent.EPrimaryCategory.RESOURCE
          || localContentData.primaryCategory === NsContent.EPrimaryCategory.PRACTICE_RESOURCE
          || localContentData.primaryCategory === NsContent.EPrimaryCategory.FINAL_ASSESSMENT
          || localContentData.primaryCategory === NsContent.EPrimaryCategory.COMP_ASSESSMENT
          || localContentData.primaryCategory === NsContent.EPrimaryCategory.OFFLINE_SESSION)
      ) {
        // real percent logic
        // const total = localContentData.leafNodes.reduce((sum: number, childId: string) => {
        //   return sum + Number(this.hierarchyMapData[childId].completionPercentage || 0)
        // },                                      0)
        // if(total > 0) {
        //   this.hierarchyMapData[identifier]['completionPercentage'] = total / _.toInteger(_.get(this.hierarchyMapData[identifier], 'leafNodesCount'))
        // }
        if (localContentData.primaryCategory === NsContent.EPrimaryCategory.MODULE) {
          this.hierarchyMapData[identifier]['duration'] = this.hierarchyMapData[identifier].leafNodes.reduce(
            (sum: any, childID: any) => {
              if (this.hierarchyMapData && this.hierarchyMapData[childID]) {
                return sum + Number(this.hierarchyMapData[childID].duration || this.hierarchyMapData[childID].expectedDuration || 0)
              }

            }, 0)
        }
        // tslint:disable
        const completedItems = _.filter(this.hierarchyMapData[identifier].leafNodes, r => (this.hierarchyMapData[r] && (this.hierarchyMapData[r].completionStatus === 2 || this.hierarchyMapData[r].completionPercentage === 100)))
        const totalCount = _.toInteger(_.get(this.hierarchyMapData[identifier], 'leafNodesCount')) || 1
        this.hierarchyMapData[identifier]['completionPercentage'] = Number(((completedItems.length / totalCount) * 100).toFixed())
        this.hierarchyMapData[identifier]['completionStatus'] = (this.hierarchyMapData[identifier].completionPercentage >= 100) ? 2 : 1
      }
      return this.hierarchyMapData[identifier]
    }
    return ''
  }

  getCompletionPercentage(identifier: string) {
    // const item = this.updateChildParentMap(identifier)
    let percent = this.hierarchyMapData && this.hierarchyMapData[identifier] && this.hierarchyMapData[identifier].completionPercentage || 0
    return this.roundIfDecimal(percent)
  }

  roundIfDecimal(value: number): number {
    if (!Number.isInteger(value)) {
      return parseFloat(value.toFixed(2))
    }
    return value
  }


  getCompletionStatus(identifier: string) {
    // const item = this.updateChildParentMap(identifier)
    return this.hierarchyMapData && this.hierarchyMapData[identifier] && this.hierarchyMapData[identifier].completionStatus
  }

  /**
   * Check if milestone is complete based on mandatory content and assessment completion
   * Returns true only when:
   * 1. All mandatory content is completed (or no mandatory content exists)
   * 2. Milestone assessment is completed (or no assessment exists)
   */
  isMilestoneComplete(identifier: string): boolean {
    if (!this.hierarchyMapData) {
      return false
    }
    const milestoneData = this.hierarchyMapData[identifier]
    if (!milestoneData) {
      return false
    }

    // Check if all mandatory content AND milestone assessment are completed
    let hasMandatoryContent = false
    let allMandatoryComplete = true
    let hasMilestoneAssessment = false
    let milestoneAssessmentComplete = false

    // Check all direct children of the milestone
    for (const key of Object.keys(this.hierarchyMapData)) {
      const item = this.hierarchyMapData[key]

      // Only check direct children
      if (item.parent !== identifier) continue

      // Check if this is the milestone assessment
      const isAssessment =
        item.primaryCategory === 'Course Assessment' ||
        item.primaryCategory === 'Final Assessment' ||
        item.primaryCategory === 'Standalone Assessment'

      if (isAssessment) {
        hasMilestoneAssessment = true
        const isCompleted = item.completionStatus === 2 || item.status === 2 ||
          item.completionPercentage >= 100 || item.progress >= 100
        if (isCompleted) {
          milestoneAssessmentComplete = true
        }
        continue // Skip to next item
      }

      // Check if this is mandatory content (courses/collections)
      if (item.primaryCategory === 'Course' || item.isCollection) {
        const isMandatory = item.isMandatory !== false // Default is mandatory

        if (isMandatory) {
          hasMandatoryContent = true
          const isCompleted = item.completionStatus === 2 || item.status === 2 ||
            item.completionPercentage >= 100 || item.progress >= 100
          if (!isCompleted) {
            allMandatoryComplete = false
          }
        }
      }
    }

    // Milestone is complete when:
    // 1. All mandatory content is completed (or no mandatory content exists)
    // 2. Milestone assessment is completed (or no assessment exists)
    const mandatoryCheck = !hasMandatoryContent || allMandatoryComplete
    const assessmentCheck = !hasMilestoneAssessment || milestoneAssessmentComplete

    return mandatoryCheck && assessmentCheck
  }

  openCertificateDialog(certData: any) {
    const cet = certData
    this.dialog.open(CertificateDialogComponent, {
      // height: '400px',
      width: '1300px',
      data: { cet },
      // panelClass: 'custom-dialog-container',
    })
  }
  scrollView() {
    try {
      let errorField: any = this.renderer.selectRootElement('.resource-container .resource-active')
      if (errorField) {
        errorField.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" })
      }
      if (this.componentName === 'toc') {
        if (errorField) {
          const rect = errorField.getBoundingClientRect()
          if (rect.top - 420 > 0) {
            window.scroll(420, rect.top - 148)
          }
        }
      }
      setTimeout(() => {
        this.appTocSvc.getPageScroll.next(false)
      }, 700)

      // else {
      //   errorField.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
      //   const rect = errorField.getBoundingClientRect();
      //   errorField.scroll(0,rect.top-56)
      // }
    } catch (err) {
    }
  }

  downloadCertificate(certificateData: any) {

    this.events.raiseInteractTelemetry(
      {
        type: WsEvents.EnumInteractTypes.CLICK,
        id: 'view-certificate',
        subType: WsEvents.EnumInteractSubTypes.CERTIFICATE,
      },
      {
        id: certificateData,   // id of the certificate
        type: WsEvents.EnumInteractSubTypes.CERTIFICATE,
      })
    if (certificateData) {
      this.downloadCertificateLoading = true
      let certData: any = certificateData || certificateData.identifier
      this.certificateService.downloadCertificate_v3(certData).subscribe((res: any) => {
        this.downloadCertificateLoading = false
        const cet = res.result.printUri
        this.dialog.open(CertificateDialogComponent, {
          width: '1300px',
          data: { cet, certId: certData },
        })
      })
    } else {
      this.downloadCertificateLoading = false
    }
  }
  ngOnDestroy() {
    if (this.hashmapUpdatedSubscription) {
      this.hashmapUpdatedSubscription.unsubscribe()
    }
    if (this.pageScrollSubscription) {
      this.pageScrollSubscription.unsubscribe()
    }
  }

  get checkForCuratedProgram() {
    if (this._cacheInitialized) {
      return this._cachedCheckForCuratedProgram
    }
    return this.computeCheckForCuratedProgram()
  }

  get isContentUnlocked() {
    if (this._cacheInitialized) {
      return this._cachedIsContentUnlocked
    }
    return this.computeIsContentUnlocked()
  }

  get isParentMilestoneLocked(): boolean {
    if (this._cacheInitialized) {
      return this._cachedIsParentMilestoneLocked
    }
    return this.computeIsParentMilestoneLocked()
  }

  get isMilestoneLocked(): boolean {
    if (this._cacheInitialized) {
      return this._cachedIsMilestoneLocked
    }
    return this.computeIsMilestoneLocked()
  }

  get isMilestoneAssessment(): boolean {
    if (this._cacheInitialized) {
      return this._cachedIsMilestoneAssessment
    }
    return this.computeIsMilestoneAssessment()
  }

  get isMilestoneAssessmentLocked(): boolean {
    if (this._cacheInitialized) {
      return this._cachedIsMilestoneAssessmentLocked
    }
    return this.computeIsMilestoneAssessmentLocked()
  }

  /**
   * Check if a milestone's mandatory courses and assessment are completed.
   * Looks at the content hierarchy to find children of the milestone.
   */
  private checkMilestoneContentCompletion(milestoneId: string): boolean {
    if (!this.baseContentReadData || !this.baseContentReadData.children || !this.hierarchyMapData) {
      // Fallback: Try to find assessment completion in hashmap for this milestone
      return this.checkMilestoneAssessmentCompletion(milestoneId)
    }

    // Find the milestone in the content hierarchy
    const milestoneContent = this.findContentInHierarchy(this.baseContentReadData, milestoneId)
    if (!milestoneContent || !milestoneContent.children) {
      return this.checkMilestoneAssessmentCompletion(milestoneId)
    }

    // Check all mandatory courses and assessments
    let allMandatoryComplete = true
    let hasAssessment = false
    let assessmentComplete = false

    milestoneContent.children.forEach((child: any) => {
      const childData = this.hierarchyMapData[child.identifier]
      const isAssessment = child.primaryCategory === 'Course Assessment' ||
        child.courseCategory === 'Course Assessment' ||
        child.primaryCategory === 'Final Assessment'
      const isMandatory = child.mandatory === true || child.optionalReading !== true

      if (isAssessment) {
        hasAssessment = true
        if (childData && (childData.completionStatus === 2 || childData.completionPercentage >= 100)) {
          assessmentComplete = true
        }
      } else if (isMandatory) {
        // Check if mandatory content is completed
        if (!childData || (childData.completionStatus !== 2 && childData.completionPercentage < 100)) {
          allMandatoryComplete = false
        }
      }
    })


    // Milestone is complete if assessment is complete (mandatory courses optional based on requirements)
    return hasAssessment ? assessmentComplete : allMandatoryComplete
  }

  /**
   * Fallback: Check if enough assessments are completed to unlock this milestone.
   * For milestone at index N, we need at least N completed assessments.
   * E.g., For M2 (index 1), we need 1 completed assessment (M1's assessment)
   *       For M3 (index 2), we need 2 completed assessments (M1's and M2's)
   */
  private checkMilestoneAssessmentCompletion(milestoneId: string): boolean {
    if (!this.hierarchyMapData) {
      return false
    }

    // Extract milestone number from ID (M1 -> 1, M2 -> 2, etc.)
    const milestoneNum = parseInt(milestoneId.replace(/\D/g, '')) || 0
    const requiredCompletedAssessments = milestoneNum - 1 // For M2, need 1; for M3, need 2


    if (requiredCompletedAssessments <= 0) {
      return true // First milestone, no requirements
    }

    // Count completed Course Assessments that are INSIDE milestones (have a parent)
    // Exclude pre-enrollment assessments at the root level (no parent or parent is Learning Pathway)
    let completedMilestoneAssessmentCount = 0
    const learningPathwayId = this.baseContentReadData?.identifier

    for (const key of Object.keys(this.hierarchyMapData)) {
      const item = this.hierarchyMapData[key]

      // Check if it's a completed Course Assessment
      if ((item.primaryCategory === 'Course Assessment' || item.courseCategory === 'Course Assessment') &&
        (item.completionStatus === 2 || item.completionPercentage >= 100)) {

        // Check if this assessment has a parent (meaning it's inside a course/milestone, not at root level)
        // Also exclude if parent is the Learning Pathway itself (pre-enrollment assessment)
        const hasParent = item.parent && item.parent !== learningPathwayId

        if (hasParent) {
          completedMilestoneAssessmentCount++
        }
      }
    }
    // If we have enough completed milestone assessments, unlock this milestone
    return completedMilestoneAssessmentCount >= requiredCompletedAssessments
  }

  private findContentInHierarchy(content: any, identifier: string): any {
    if (!content) return null
    if (content.identifier === identifier) return content
    if (content.children) {
      for (const child of content.children) {
        const found = this.findContentInHierarchy(child, identifier)
        if (found) return found
      }
    }
    return null
  }

  get computedQueryParams() {
    if (this.isAllowed && !this.forPreview && this.isEnabled) {
      return {
        ...this.resourceLink.queryParams,
        preAssessment: 'true'
      }
    }
    return null
  }

  get isMilestone(): boolean {
    if (this._cacheInitialized) {
      return this._cachedIsMilestone
    }
    return this.computeIsMilestone()
  }

  getMilestoneCompletedCount(): number {
    if (this._cacheInitialized) {
      return this._cachedMilestoneCompletedCount
    }
    return this.computeMilestoneCompletedCount()
  }

  private computeMilestoneCompletedCount(): number {
    if (!this.content || !this.hierarchyMapData) {
      return 0
    }
    const milestoneData = this.hierarchyMapData[this.content.identifier]
    if (!milestoneData || !milestoneData.leafNodes) {
      return 0
    }

    let completedCount = 0

    milestoneData.leafNodes.forEach((leafId: string) => {
      const leafData = this.hierarchyMapData[leafId]
      if (leafData) {
        // CRITICAL: Check multiple completion indicators
        const isCompleted =
          leafData.completionStatus === 2 ||
          leafData.status === 2 ||
          (leafData.completionPercentage && leafData.completionPercentage >= 100) ||
          (leafData.progress && leafData.progress >= 100)

        if (isCompleted) {
          completedCount++
        }
      }
    })

    return completedCount
  }

  /**
   * Get unlock criteria message for locked milestones
   */
  getMilestoneUnlockMessage(): string {
    if (!this.content || !this.hierarchyMapData) {
      return ''
    }

    const milestoneData = this.hierarchyMapData[this.content.identifier]
    if (!milestoneData) {
      return ''
    }

    // Check if hashmap has pre-computed unlock message
    if (milestoneData.unlockMessage) {
      return milestoneData.unlockMessage
    }

    const milestoneIndex = milestoneData.milestoneIndex

    // Milestone 1 requires pre-assessment completion
    if (milestoneIndex === 0) {
      return 'Complete the preliminary assessment to unlock this milestone'
    }

    // Other milestones require previous milestone completion
    return `Complete all mandatory content and assessment in Milestone ${milestoneIndex} to unlock this milestone`
  }

  /**
   * Get lock message for content inside locked milestones
   */
  getParentMilestoneLockMessage(): string {
    if (!this.isParentMilestoneLocked) {
      return ''
    }
    return 'This content is locked. Complete previous milestone to view this content.'
  }

  /**
   * Get lock message for milestone assessments
   */
  getAssessmentLockMessage(): string {
    if (!this.content || !this.hierarchyMapData) {
      return ''
    }

    const hashData = this.hierarchyMapData[this.content.identifier]

    // Check if hashmap has pre-computed assessment lock message
    if (hashData && hashData.assessmentLockMessage) {
      return hashData.assessmentLockMessage
    }

    if (this.isMilestoneAssessmentLocked) {
      return 'This content is locked. Complete all mandatory items to unlock the assessment.'
    }

    return ''
  }

  shouldShowDownloadButton(content: NsContent.IContent | null): boolean {
    if (!content) {
      return false
    }

    // Check if content has an artifact URL (downloadable resource)
    if (!content.artifactUrl) {
      return false
    }

    // Check if base content resource category includes "Case Study"
    if (!this.baseContentReadData?.courseCategory ||
      this.baseContentReadData.courseCategory !== NsContent.ECourseCategory.CASE_STUDY) {
      return false
    }

    //for public scenario check if its player plage then only enable download
    if (this.forPreview && !window.location.href.includes('/viewer/')) {
      return false
    }

    // for logged in user check if user enrolled then only allow download
    if (!this.forPreview && !this.isEnrolled) {
      return false
    }

    // Define downloadable MIME types
    const downloadableMimeTypes = [
      NsContent.EMimeTypes.PDF
    ]

    return downloadableMimeTypes.includes(content.mimeType)
  }

  downloadContent(content: NsContent.IContent, event?: MouseEvent) {
    if (event) {
      event.preventDefault()
      event.stopPropagation()
    }
    const pageId = `app/toc/pageId/${content.identifier}`
    this.resourceDownloadHelperSvc.downloadPDF(content, pageId)
  }



  /**
   * View milestone achievement - calls the achievement API and shows the result
   */
  viewMilestoneAchievement(event: MouseEvent, mileStoneData: any) {

    if (event) {
      event.preventDefault()
      event.stopPropagation()
    }

    if (!this.content || !this.batchId || this.achievementLoading) {
      return
    }

    // Get user ID from ConfigurationsService
    const userId = this.configSvc?.userProfile?.userId
    if (!userId) {
      return
    }

    // Extract milestone ID (e.g., "m1", "m2") from the content name or index
    // Try to get milestone number from the index or extract from content
    let milestoneId = 'm' + (this.index - 1) // index is typically 1-based, milestones are 0-based

    // If content name contains milestone number, extract it
    if (this.content.name) {
      milestoneId = mileStoneData?.identifier
    }

    const courseId = this.baseContentReadData?.identifier || this.rootId

    this.achievementLoading = true

    this.appTocSvc.generateMilestoneAchievement(userId, courseId, this.batchId, milestoneId).subscribe({
      next: (response: any) => {
        this.achievementLoading = false
        // Show achievement dialog or handle response
        if (response && response.result) {
          // Open a dialog to show the achievement
          this.dialog.open(CertificateDialogComponent, {
            width: '1300px',
            data: {
              cet: response.result.printUri || response.result.svgData,
              certId: response?.result?.identifier || milestoneId,
              isAchievement: true
            },
          })
        }
      },
      error: (error: any) => {
        this.achievementLoading = false
        // Show error message in snackbar
        const errorMessage = error?.error?.result?.message || error?.message || 'Failed to generate achievement'
        this.snackBar.open(errorMessage, 'Close', {
          duration: 5000,
          horizontalPosition: 'center',
          verticalPosition: 'bottom',
          panelClass: ['error-snackbar']
        })
      }
    })
  }
  /**
    * Check if text is truncated (has ellipsis) - for single line text
    * @param element The HTMLElement to check
    * @returns true if text is truncated, false otherwise
    */
  isTextTruncated(element: HTMLElement): boolean {
    if (!element) return false
    return element.offsetWidth < element.scrollWidth
  }

  /**
   * @param element The HTMLElement to check
   * @returns true if text is truncated, false otherwise
   */
  isMultiLineTruncated(element: HTMLElement): boolean {
    if (!element) return false
    return element.scrollHeight > element.clientHeight
  }
}
