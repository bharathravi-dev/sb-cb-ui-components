import {
  Component, OnDestroy, OnInit, AfterViewInit, AfterViewChecked,
  HostListener, ElementRef, ViewChild, ViewEncapsulation, Input,
  Inject, ChangeDetectorRef,
} from '@angular/core'
import { Location } from '@angular/common'
import { SafeHtml, DomSanitizer, SafeStyle } from '@angular/platform-browser'
import { ActivatedRoute, Event, Data, Router, NavigationEnd } from '@angular/router'
import { UntypedFormControl, Validators } from '@angular/forms'
// import { HttpErrorResponse } from '@angular/common/http'
import { TranslateService } from '@ngx-translate/core'
import { Subscription, Observable, Subject, of, from } from 'rxjs'
import { catchError, share, switchMap, takeUntil } from 'rxjs/operators'
import dayjs from 'dayjs'
// tslint:disable-next-line
import _ from 'lodash'
dayjs.extend(isSameOrBefore)
import moment from 'moment'
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore'

import { NsContent } from '../../_services/widget-content.model'
import { WidgetContentService } from '../../_services/widget-content.service'
import { viewerRouteGenerator } from '../../_services/viewer-route-util'
import { NsWidgetResolver } from '@sunbird-cb/resolver-v2'
import {
  ConfigurationsService, DataTransferService, EventService,
  LoggerService, MultilingualTranslationsService,
  NsPage, TFetchStatus, TelemetryService,
  UtilityService, WidgetEnrollService, WsEvents,
} from '@sunbird-cb/utils-v2'

import { CommonMethodsService, ConfirmationDialogComponent, ContentLanguageService, TOCMultiLingualDialogComponent, WidgetContentLibService, WidgetUserServiceLib } from '@sunbird-cb/consumption'
import { NsAppToc } from '../../models/app-toc.model'
import { AppTocService } from '../../services/app-toc.service'
import { MobileAppsService } from '../../services/mobile-apps.service'
import { HandleClaimService } from '../../_collection/_common/content-toc/content-services/handle-claim.service'
import { ActionService } from '../../services/action.service'
import { RatingService } from '../../_services/rating.service'
import { ComprehensiveAssessmentService } from '../../_services/comprehensive-assessment.service'
import { ViewerUtilService } from '../../services/viewer-util.service'
import { LoadCheckService } from '../../services/load-check.service'
import { ResetRatingsService } from '../../services/reset-ratings.service'

import { AppTocDialogIntroVideoComponent } from '../app-toc-dialog-intro-video/app-toc-dialog-intro-video.component'
import { ContentRatingV2DialogComponent } from '../../_collection/_common/content-rating-v2-dialog/content-rating-v2-dialog.component'
import { TimerService } from '../../services/timer.service'
import { MatDialog as MatDialog } from '@angular/material/dialog'
import { MatSnackBar as MatSnackBar } from '@angular/material/snack-bar'
import { MatSnackBar as MatSnackbarNew } from '@angular/material/snack-bar'
import { NetCoreService } from '../../services/netcore.service'
import { EnrollLanguageDialogueComponent } from '../enroll-language-dialogue/enroll-language-dialogue.component'
import { CompletionSurveyFormComponent } from '../completion-survey-form/completion-survey-form.component'
import { PublicSurveyFormComponent } from '../public-survey-form/public-survey-form.component'
import { NsCardContent } from '../../models/card-content.model'
import { NonReleventFeedbackDialogComponent } from '../non-relevent-feedback-dialog/non-relevent-feedback-dialog.component'
import { AppTocV2Service } from '../../services/app-toc-v2.service'
import { UnenrollConfirmDialogComponent } from '../unenroll-confirm-dialog/unenroll-confirm-dialog.component'
import { IComprehensiveAssessmentAttempts, IComprehensiveAssessmentStatus } from '../../_models/common.model'

export enum ErrorType {
  internalServer = 'internalServer',
  serviceUnavailable = 'serviceUnavailable',
  somethingWrong = 'somethingWrong',
}

const flattenItems = (items: any[], key: string | number) => {
  return items.reduce((flattenedItems, item) => {
    flattenedItems.push(item)
    if (Array.isArray(item[key])) {
      // tslint:disable-next-line
      flattenedItems = flattenedItems.concat(flattenItems(item[key], key))
    }
    return flattenedItems
    // tslint:disable-next-line
  }, [])
}
const SNACKBAR_DURATION = 3000
@Component({
  selector: 'ws-app-app-toc-home-v2',
  templateUrl: './app-toc-home-v2.component.html',
  styleUrls: ['./app-toc-home-v2.component.scss'],
  // tslint:disable-next-line: use-component-view-encapsulation
  encapsulation: ViewEncapsulation.None,
  standalone: false
})
export class AppTocHomeV2Component implements OnInit, OnDestroy, AfterViewChecked, AfterViewInit {
  queryParamsData: { [key: string]: string } = {}; // Initialize queryParamsData
  show = false
  changeTab = false
  skeletonLoader = true
  banners: NsAppToc.ITocBanner | null = null
  showMoreGlance = false
  content: NsContent.IContent | null = null
  contentReadData: NsContent.IContent | null = null
  baseContentReadData: NsContent.IContent | null = null
  badgeTooltipText = ''
  errorCode: NsAppToc.EWsTocErrorCode | null = null
  resumeData: any = null
  nsCardContentData: any = NsCardContent.ACBPConst
  batchData: NsContent.IBatchListResponse | null = null
  currentCourseBatchId: string | null = null
  userEnrollmentList!: NsContent.ICourse[]
  routeSubscription: Subscription | null = null
  pageNavbar: Partial<NsPage.INavBackground> = this.configSvc.pageNavBar
  isCohortsRestricted = false
  sticky = false
  isInIframe = false
  cbPlanEndDate: any
  cbPlanDuration: any
  enrolledCourseData: any
  @Input() forPreview: any = window.location.href.includes('/public/') || window.location.href.includes('/author/') || window.location.href.includes('/preview/')
  @Input() inputContent: any
  @Input() displayViewBtn: any = true
  /** Handed to the content toc, it falls back to its own breadcrumbs when none are given. */
  @Input() caBreadcrumbs: any[] = []
  // forPreview = window.location.href.includes('/author/')
  analytics = this.route.snapshot.data?.pageData?.data?.analytics
  errorWidgetData: NsWidgetResolver.IRenderConfigWithTypedData<any> = {
    widgetType: 'errorResolver',
    widgetSubType: 'errorResolver',
    widgetData: {
      errorType: 'internalServer',
    },
  }
  isAuthor = false
  authorBtnWidget: NsPage.INavLink = {
    actionBtnId: 'feature_authoring',
    config: {
      type: 'mat-button',
    },
  }
  tocConfig: any = null
  primaryCategory = NsContent.EPrimaryCategory
  courseCategory = NsContent.ECourseCategory
  WFBlendedProgramStatus = NsContent.WFBlendedProgramStatus
  comprehensiveAssessmentCategory = 'Comprehensive Assessment'
  isAllCoursesCompleted = false
  assessmentAttempts: IComprehensiveAssessmentAttempts = {
    attemptsMade: 0,
    attemptsAllowed: 0,
    attemptsRemaining: 0,
    isAttempted: false,
  }
  askAuthorEnabled = true
  trainingLHubEnabled = false
  trainingLHubCount$?: Observable<number>
  body: SafeHtml | null = null
  viewMoreRelatedTopics = false
  hasTocStructure = false
  tocStructure: NsAppToc.ITocStructure | null = null
  contentParents: { [key: string]: NsAppToc.IContentParentResponse[] } = {}
  objKeys = Object.keys
  fragment!: string
  activeFragment = this.route.fragment.pipe(share())
  currentFragment = 'overview'
  showScroll!: boolean
  showScrollHeight = 300
  hideScrollHeight = 10
  elementPosition: any
  batchSubscription: Subscription | null = null
  batchDataSubscription: Subscription | null = null
  resumeDataSubscription: Subscription | null = null
  translationSubscription: Subscription | null = null
  hashmapUpdatedSubscription: Subscription | null = null
  @ViewChild('stickyMenu', { static: true }) menuElement!: ElementRef
  batchControl = new UntypedFormControl('', Validators.required)
  contentProgress = 0
  bannerUrl: SafeStyle | null = null
  routePath = 'overview'
  validPaths = new Set(['overview', 'contents', 'analytics'])
  routerParamSubscription: Subscription | null = null
  isPublic = false
  initialrouteData: any
  actionBtnStatus = 'wait'
  isRegistrationSupported = false
  showIntranetMessage = false
  firstResourceLink: { url: string; queryParams: { [key: string]: any } } | null = null
  resumeDataLink: { url: string; queryParams: { [key: string]: any } } | null = null
  certData: any = null
  showTakeAssessment: NsAppToc.IPostAssessment | null = null
  checkRegistrationSources: Set<string> = new Set([
    'SkillSoft Digitalization',
    'SkillSoft Leadership',
    'Pluralsight',
  ])
  externalContentFetchStatus: TFetchStatus = 'done'
  registerForExternal = false
  isGoalsEnabled = false
  contextId?: string
  contextPath?: string
  defaultSLogo = ''
  disableEnrollBtn = false
  isAssessVisible = false
  isPracticeVisible = false
  certificateOpen = false
  breadcrumbs: any
  historyData: any
  courseCompleteState = 2
  userId: any
  userRating: any
  dakshtaName = this.environment.dakshtaName
  cscmsUrl = this.environment.cscmsUrl
  showBtn = false
  channelId: any
  selectedBatchData: any
  selectedBatchSubscription: any
  serverDateSubscription: any
  serverDate: any
  kparray: any = []
  enrollBtnLoading = false
  isAcbpCourse = false
  isAcbpClaim = false
  courseID: any
  isClaimed = false
  monthlyCapExceed = false
  isCompletedThisMonth = false
  startDate: any
  endDate: any
  startDateDifference: any
  endDateDifference: any
  @ViewChild('rightContainer') rcElement!: ElementRef
  @ViewChild('bannerDetails', { static: true }) bannerElem!: ElementRef
  @ViewChild('contentSource') contentSource!: ElementRef
  sourceEllipsis = false
  scrollLimit = 0
  rcElem = {
    offSetTop: 0,
    BottomPos: 0,
  }
  scrolled = false
  pathSet = new Set()
  canShare = false
  enableShare = false
  canUnenroll = false
  rootOrgId: any
  certId: any
  mobile1200: any
  assessmentStrip: any
  learnAdvisoryData: any
  contentCreatorData: any = []
  // randomlearnAdvisoryObj: any
  // learnAdvisoryDataLength: any

  allBatchesAreFull = false
  activeBatchIds: any = []
  fullBatcheIds: any = []

  private destroySubject$ = new Subject<any>()
  timerUnsubscribe: any
  timer: any
  isReleventBtnHovered = false
  SAKSHAMAI_ICON_NORMAL = '/assets/images/sakshamAI/ai-icon.svg'
  SAKSHAMAI_ICON_LOADER = '/assets/images/sakshamAI/saksham_ai_loader.gif'
  recommendedCoursesId = ''
  feedbackGiven: any
  preAssessmentCompletionStatus = false
  fromAITutor = false
  languageList: any = []
  selectedLanguage: any
  languageMapProgress: any
  preAssessmentRequiredFlag: any = false
  lockCertificate = false
  private lastProgressRefreshTime: number = 0
  private isRefreshingProgress: boolean = false
  isUnEnrolled: boolean = false
  @HostListener('window:scroll', ['$event'])
  handleScroll() {
    const windowScroll = window.pageYOffset
    if (windowScroll >= this.elementPosition - 100) {
      this.sticky = true
    } else {
      this.sticky = false
    }

    if (this.scrollLimit && this.rcElement) {
      if ((window.scrollY + this.rcElem.BottomPos) >= this.scrollLimit) {
        this.rcElement.nativeElement.style.position = "sticky";
      } else {
        this.rcElement.nativeElement.style.position = "fixed";
      }
    }

    // 236... (OffsetTop of right container + 104)
    if (window.scrollY > (this.rcElem.offSetTop + 104)) {
      this.scrolled = true
    } else {
      this.scrolled = false
    }
  }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private contentSvc: WidgetContentService,
    public tocSvc: AppTocService,
    private loggerSvc: LoggerService,
    private configSvc: ConfigurationsService,
    private domSanitizer: DomSanitizer,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private mobileAppsSvc: MobileAppsService,
    private utilitySvc: UtilityService,
    // private progressSvc: ContentProgressService,
    private contentLangSvc: ContentLanguageService,
    private actionSVC: ActionService,
    private viewerSvc: ViewerUtilService,
    private ratingSvc: RatingService,
    private telemetryService: TelemetryService,
    private translate: TranslateService,
    private langtranslations: MultilingualTranslationsService,
    private events: EventService,
    // private matSnackBar: MatSnackBar,
    private loadCheckService: LoadCheckService,
    private handleClaimService: HandleClaimService,
    private resetRatingsService: ResetRatingsService,
    private timerService: TimerService,
    public enrollSvc: WidgetEnrollService,
    public contentLibSvc: WidgetContentLibService,
    public dataTransferSvc: DataTransferService,
    private matSnackbarNew: MatSnackbarNew,
    private userServiceLib: WidgetUserServiceLib,
    public netCoreService: NetCoreService,
    public appTocV2Svc: AppTocV2Service,
    private location: Location,
    private commonMethodsSvc: CommonMethodsService,
    private comprehensiveAssessmentSvc: ComprehensiveAssessmentService,
    @Inject('environment') public environment: any,
    private cdr: ChangeDetectorRef
  ) {
    this.historyData = history.state
    this.handleBreadcrumbs()
    this.mobileAppsSvc.mobileTopHeaderVisibilityStatus.next(true)
    if (localStorage.getItem('websiteLanguage')) {
      this.translate.setDefaultLang('en')
      const lang = localStorage.getItem('websiteLanguage')!
      this.translate.use(lang)
    }

    this.loadCheckService.childComponentLoaded$.subscribe(_isLoaded => {
      // Present in app-toc-about.component
      if (document.getElementById('ratingsDiv')) {
        setTimeout(() => {
          const ratingsDiv = document.getElementById('ratingsDiv') as any
          if (ratingsDiv) {
            this.scrollLimit = ratingsDiv.getBoundingClientRect().bottom as any
          }
        }, 500)
      }

      if (document.getElementById('contentContainer')) {
        const contentDiv = document.getElementById('contentContainer') as any
        if (contentDiv) {
          this.scrollLimit = contentDiv.getBoundingClientRect().bottom as any
        }
      }
    })

    this.handleClaimService.getClaimData().subscribe((_eventData: any) => {
      this.onClickOfClaim(_eventData)
    })
  }

  private isApiEnabled(urlConfigPath: string, defaultUrl: string): boolean {
    return !!this.commonMethodsSvc.getEnabledUrl({
      apiConfig: this.tocConfig?.apiConfig,
      urlConfigPath,
      defaultUrl,
    })
  }

  getKarmapointsLimit() {
    if (!this.forPreview && this.isApiEnabled('totalKarmaPoints', '/apis/proxies/v8/user/totalkarmapoints')) {
      this.contentSvc.userKarmaPoints().subscribe((res: any) => {
        if (res && res.kpList) {
          const info = res.kpList.addinfo
          if (info) {
            this.monthlyCapExceed = JSON.parse(info).claimedNonACBPCourseKarmaQuota >= 4
          }
        }
      })
    }
  }

  isCourseCompletedOnThisMonth() {
    const now = moment(this.serverDate).format('YYYY-MM-DD')
    if (this.content) {
      const courseData = this.enrolledCourseData
      if (courseData && courseData.completionPercentage === 100 && courseData.completedOn) {
        const completedOn = moment(courseData.completedOn).format('YYYY-MM-DD')
        const completedMonth = moment(completedOn, 'YYYY-MM-DD').month()
        const currentMonth = moment(now, 'YYYY-MM-DD').month()
        this.isCompletedThisMonth = completedMonth === currentMonth
        this.content['viewMore'] = false
        this.content['completedOn'] = courseData.completedOn
      }
    }
  }

  filteredAcbpList(res: any) {
    return res.filter((v: any) => v.identifier === this.courseID)
  }

  async findACPB() {
    // CBP plan data now lives in IndexedDB (iGotAppDB/cbpPlans); getCBPData() reads the
    // current plan year from that cache instead of localStorage['cbpData'].
    const localCbp = await this.userServiceLib.getCBPData().toPromise()
    if (localCbp && localCbp.length) {
      const storeageCbp = localCbp
      const cbp = this.filteredAcbpList(storeageCbp)
      if (cbp.length) {
        const acbp = 'cbPlan'
        this.cbPlanEndDate = cbp[0].endDate
        const sDate = dayjs(this.serverDate).format('YYYY-MM-DD')
        const daysCount = dayjs(this.cbPlanEndDate).diff(this.serverDate, 'day')
        this.cbPlanDuration = daysCount < 0 ? NsCardContent.ACBPConst.OVERDUE : daysCount > 29
          ? NsCardContent.ACBPConst.SUCCESS : NsCardContent.ACBPConst.UPCOMING
        if (acbp && this.cbPlanEndDate && acbp === 'cbPlan') {
          this.isAcbpCourse = true
          const eDate = dayjs(this.cbPlanEndDate).format('YYYY-MM-DD')
          if (dayjs(sDate).isSameOrBefore(eDate)) {
            const requestObj = {
              request: {
                filters: {
                  contextType: 'Course',
                  contextId: this.courseID,
                },
              },
            }
            this.contentSvc.getCourseKarmaPoints(requestObj).subscribe((res: any) => {
              if (res && res.kpList) {
                const row = res.kpList
                if (row.addinfo) {
                  if (JSON.parse(row.addinfo).ACBP) {
                    this.isAcbpClaim = false
                    this.isClaimed = true
                  } else {
                    this.isAcbpClaim = true
                  }
                } else {
                  this.isAcbpClaim = true
                }
              } else {
                this.isAcbpClaim = true
              }
            })
          }
        }
      }
    }
  }

  raiseTelemeteryForProvider(providerName: string, prividerId: string) {
    this.events.raiseInteractTelemetry(
      {
        type: 'click',
        id: 'btn-provider',
      },
      {
        id: providerName,
        type: prividerId,
      },
      {
        pageIdExt: 'btn-provider',
        module: WsEvents.EnumTelemetrymodules.CONTENT,
      })

  }

  raiseTelemetry() {
    this.events.raiseInteractTelemetry(
      {
        type: 'click',
        subType: 'karmapoints-claim',
        id: this.courseID,
      },
      {
        id: this.courseID,
        type: 'course',
      },
      {
        pageIdExt: 'btn-acbp-claim',
        module: WsEvents.EnumTelemetrymodules.KARMAPOINTS,
      })
  }

  onClickOfClaim(event: any) {
    const request = {
      userId: this.configSvc.unMappedUser.identifier,
      courseId: this.courseID,
    }
    this.raiseTelemetry()
    this.contentSvc.claimKarmapoints(request).subscribe((res: any) => {
      this.isClaimed = true
      this.openSnackbar('Karma points are successfully claimed.')
      // this.getUserEnrollmentList()
      this.checkIfUserEnrolled()
    }, (error: any) => {
      this.openSnackbar('something went wrong.')
    })
  }

  ngAfterViewInit() {
    if (this.rcElement) {
      this.rcElem.BottomPos = this.rcElement.nativeElement.offsetTop + this.rcElement.nativeElement.offsetHeight
      this.rcElem.offSetTop = this.rcElement.nativeElement.offsetTop
    }
    // Get Time for the batch
    this.timerUnsubscribe = this.timerService.getTimerData()
      .pipe(takeUntil(this.destroySubject$))
      .subscribe((_timer: any) => {
        this.timer = _timer
      })
  }

  handleBreadcrumbs() {
    if (this.historyData) {
      if (this.historyData.path === 'Search') {
        const searchurl = `/app/globalsearch`
        const qParam = {
          q: this.historyData.param,
        }
        // tslint:disable-next-line:max-line-length
        this.breadcrumbs = { url: 'home', titles: [{ title: 'Search', url: searchurl, queryParams: qParam }, { title: 'Details', url: 'none' }] }
      } else if (this.historyData.path === 'competency-details') {
        const finalUrl = `/app/learn/browse-by/competency/${this.historyData.param}`
        // tslint:disable-next-line: max-line-length
        this.breadcrumbs = { url: 'home', titles: [{ title: this.historyData.param, url: finalUrl }, { title: 'Details', url: 'none' }] }
      } else if (this.historyData.path === 'all-CBP') {
        const finalURL = `/app/learn/browse-by/provider/${this.historyData.param}`
        this.breadcrumbs = { url: 'home', titles: [{ title: `all CBP's`, url: finalURL }, { title: 'Details', url: 'none' }] }
      } else if (this.historyData.path === 'all-competencies') {
        const finalUrl = `/app/learn/browse-by/competency/all-competencies`
        // tslint:disable-next-line: max-line-length
        this.breadcrumbs = { url: 'home', titles: [{ title: 'all competencies', url: finalUrl }, { title: 'Details', url: 'none' }] }
      } else if (this.historyData.path === 'curatedCollections') {
        const finalUrl = `/app/curatedCollections/home`
        // tslint:disable-next-line: max-line-length
        this.breadcrumbs = { url: 'home', titles: [{ title: 'curated collections', url: finalUrl }, { title: 'Details', url: 'none' }] }
      } else {
        // tslint:disable-next-line:max-line-length
        this.breadcrumbs = { url: 'home', titles: [{ title: 'Learn', url: '/page/learn', icon: 'school' }, { title: 'Details', url: 'none' }] }
      }
    }
  }

  ngAfterViewChecked(): void {
    try {
      if (this.fragment) {
        // tslint:disable-next-line: no-non-null-assertion
        document!.querySelector(`#${this.fragment}`)!.scrollTo({
          top: 80,
          behavior: 'smooth',
        })
      }
    } catch (e) { }
  }

  get enableAnalytics(): boolean {
    if (this.configSvc.restrictedFeatures) {
      return !this.configSvc.restrictedFeatures.has('tocAnalytics')
    }
    return false
  }

  get isComprehensiveAssessment(): boolean {
    return this.contentReadData?.courseCategory === this.comprehensiveAssessmentCategory
      || this.content?.courseCategory === this.comprehensiveAssessmentCategory
  }

  get caPlanEndDate(): string | null {
    return (this.baseContentReadData as any)?.trainingPlan_v2?.endDate || null
  }

  get caPlanDuration(): string | null {
    if (!this.caPlanEndDate) {
      return null
    }
    const daysCount = dayjs(this.caPlanEndDate).diff(this.serverDate || new Date(), 'day')
    return daysCount < 0 ? NsCardContent.ACBPConst.OVERDUE : daysCount > 29
      ? NsCardContent.ACBPConst.SUCCESS : NsCardContent.ACBPConst.UPCOMING
  }

  get isCaOverdue(): boolean {
    return this.caPlanDuration === NsCardContent.ACBPConst.OVERDUE
  }

  get isAssessmentLocked(): boolean {
    return this.isComprehensiveAssessment && !this.isAllCoursesCompleted
  }

  get isAssessmentAttempted(): boolean {
    return this.assessmentAttempts.isAttempted
  }

  get assessmentAttemptsRemaining(): number {
    return this.assessmentAttempts.attemptsRemaining
  }

  get totalAssessmentAttempts(): number {
    return this.assessmentAttempts.attemptsAllowed || this.contentReadData?.maxAssessmentRetakeAttempts || 0
  }

  private loadComprehensiveAssessmentStatus(): void {
    if (!this.isComprehensiveAssessment) {
      return
    }
    this.comprehensiveAssessmentSvc.getUnlockStatus(this.contentReadData)
      .then((status: IComprehensiveAssessmentStatus) => {
        this.isAllCoursesCompleted = status.isAllCoursesCompleted
      })
      .catch((err: any) => {
        this.isAllCoursesCompleted = false
        this.loggerSvc.warn('Unable to resolve comprehensive assessment unlock status', err)
      })

    // this.comprehensiveAssessmentSvc.getAttemptStatus(this.contentReadData)
    //   .then((attempts: IComprehensiveAssessmentAttempts) => {
    //     this.assessmentAttempts = attempts
    //   })
    //   .catch((err: any) => {
    //     this.loggerSvc.warn('Unable to resolve comprehensive assessment attempts', err)
    //   })
  }

  get isResource() {
    if (this.content) {
      const isResource = this.content.primaryCategory === NsContent.EPrimaryCategory.KNOWLEDGE_ARTIFACT ||
        this.content.primaryCategory === NsContent.EPrimaryCategory.RESOURCE
        || this.content.primaryCategory === NsContent.EPrimaryCategory.PRACTICE_RESOURCE
        || this.content.primaryCategory === NsContent.EPrimaryCategory.FINAL_ASSESSMENT
        || this.content.primaryCategory === NsContent.EPrimaryCategory.COMP_ASSESSMENT
        || this.content.primaryCategory === NsContent.EPrimaryCategory.OFFLINE_SESSION
        || !(this.content.children && this.content.children.length)
      if (isResource) {
        this.mobileAppsSvc.sendViewerData(this.content)
      }
      return isResource
    }
    return false
  }

  get getStartDate() {
    if (this.enrolledCourseData) {
      const now = new Date().getTime()
      // const batch = _.first(_.filter(this.content['batches'], { batchId: this.currentCourseBatchId }) || [])
      const batch = this.enrolledCourseData.batch
      this.currentCourseBatchId = batch.batchId
      if (batch && this.currentCourseBatchId) {
        this.startDate = (_.get(batch, 'startDate'))
        // const parsedDate = moment(this.startDate);
        // const dateOnly = parsedDate.clone().startOf('day');
        const startDateTime = this.startDate && new Date(this.startDate).getTime()
        this.startDateDifference = startDateTime - now
        if (this.startDateDifference && this.startDateDifference > 0) {
          const days = Math.floor(this.startDateDifference / (1000 * 60 * 60 * 24))
          const hours = Math.floor((this.startDateDifference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
          const minutes = Math.floor((this.startDateDifference % (1000 * 60 * 60)) / (1000 * 60))
          return (`${days} Days : ${hours} Hours : ${minutes} Minutes`)
        }
        return 'NA'
      }
      return 'NA'
      // if (_.get(batch, 'startDate') && moment(_.get(batch, 'startDate')).isAfter()) {
      //   return moment(_.get(batch, 'startDate')).from(now)
      // }
      // if (_.get(batch, 'endDate') && moment(_.get(batch, 'endDate')).isBefore()) {
      //   return 'NA'
      // }
      // if (startDateTime && moment(startDateTime).isAfter())  {
      //   return moment(startDateTime).from(now)
      // }
      // if (endDateTime && moment(endDateTime).isBefore()) {
      //     return 'NA'
      //   }
      // return 'NA'
    } return 'NA'
  }

  get isBatchInProgress() {
    // if (this.content && this.content['batches']) {
    // const batches = this.content['batches'] as NsContent.IBatch
    // if (this.currentCourseBatchId) {
    //   // const now = moment().format('YYYY-MM-DD HH:mm:ss')
    //   const now = new Date().getTime()
    //   if (this.batchData && this.batchData.content) {
    //     const batch = _.first(_.filter(this.batchData.content, { batchId: this.currentCourseBatchId }) || [])
    //     if (batch) {
    //       // const startDate = moment(batch.startDate).format('YYYY-MM-DD HH:mm:ss')
    //       // const endDate = batch.endDate ? moment(batch.endDate).format('YYYY-MM-DD HH:mm:ss') : now
    //       // return (
    //       //   // batch.status &&
    //       //   moment(startDate).isSameOrBefore(now)
    //       //   && moment(endDate).isSameOrAfter(now)
    //       // )
    //       this.startDate = batch && (_.get(batch, 'startTime'))
    //       this.endDate = batch && (_.get(batch, 'endTime'))
    //       const endDateTime = new Date(this.endDate).getTime()
    //       this.endDateDifference = endDateTime - now
    //       if(this.endDateDifference > 0) {
    //       return  batch.status
    //       }
    //     }
    //     return false
    //   }
    //   return false
    // } return false

    if (this.enrolledCourseData) {
      const now = new Date().getTime()
      const batch = this.enrolledCourseData.batch
      this.currentCourseBatchId = batch.batchId
      if (batch && this.currentCourseBatchId) {
        this.startDate = (_.get(batch, 'startDate'))
        this.endDate = (_.get(batch, 'endDate'))
        if (this.endDate) {
          const startDateTime = this.startDate && new Date(this.startDate).getTime()
          let endDate = this.endDate && new Date(this.endDate)
          endDate.setHours(23, 59, 59, 999)
          const endDateTime = endDate.getTime()
          this.startDateDifference = now - startDateTime
          this.endDateDifference = endDateTime - now
          if (this.endDateDifference > 0 && this.startDateDifference > 0 && batch.status !== 2) {
            return true
          }
          return false
        }
        return true
      }
      return false
    }
    return false
  }



  getUserRating(fireUpdate: boolean) {
    if (!this.forPreview && this.isApiEnabled('ratingRead', '/apis/proxies/v8/ratings/v1/read')) {
      if (this.configSvc.userProfile) {
        this.userId = this.configSvc.userProfile.userId || ''
      }
      if (this.content && this.content.identifier && this.content.primaryCategory) {
        this.ratingSvc.getRating(this.content.identifier, this.content.primaryCategory, this.userId).subscribe(
          (res: any) => {

            if (res && res.result && res.result.response) {
              this.userRating = res.result.response
              if (fireUpdate) {
                this.tocSvc.changeUpdateReviews(true)
              }
            }
            this.contentViewEventForNetCore('view')
          },
          (err: any) => {
            this.loggerSvc.error('USER RATING FETCH ERROR >', err)
          }
        )
      }
    }

    setTimeout(() => {
      if (this.contentSource && this.contentSource.nativeElement.offsetHeight > 44) {
        this.sourceEllipsis = true
      }
    }, 250)
  }



  public fetchUserWFForBlended() {
    const applicationIds = (this.batchData && this.batchData.content && this.batchData.content.map(e => e.batchId)) || []
    const req = {
      applicationIds,
      serviceName: 'blendedprogram',
      limit: 100,
      offset: 0,
    }

    this.contentSvc.fetchBlendedUserWF(req).then(
      (data: any) => {
        if (data && data.result && data.result.data.length) {
          const latestWF = _.maxBy(data.result.data[0].wfInfo, (el: any) => {
            return new Date(el.lastUpdatedOn).getTime()
          })
          // latestWF.currentStatus = this.WFBlendedProgramStatus.REJECTED
          /* tslint:disable-next-line */
          this.batchData!.workFlow = {
            wfInitiated: true,
            /* tslint:disable-next-line */
            batch: this.batchData && this.batchData.content && this.batchData.content.find((e: any) => e.batchId === latestWF.applicationId),
            wfItem: latestWF,
          }
          this.tocSvc.setWFData(this.batchData)
        }

        this.loggerSvc.info('fetchBlendedUserWF data == ', data)
      },
      (error: any) => {
        this.loggerSvc.error('CONTENT HISTORY FETCH ERROR >', error)
      },
    )
  }

  public checkIfBatchExists(latest: any) {
    if (!this.batchData || !this.batchData.content) {
      return false
    }
    return this.batchData.content.find(b => b.batchId === latest.batchId)
  }

  public getBatchId(): string {
    let batchId = ''
    if (this.batchData && this.batchData.content) {
      for (const batch of this.batchData.content) {
        batchId = batch.batchId
      }
    }
    return batchId
  }


  public handleAutoBatchAssign() {
    if (this.forPreview) {
      this.navigateToPlayerPage('')
    } else {
      this.enrollBtnLoading = true
      this.changeTab = !this.changeTab
      this.raiseEnrollmentTelemetry('enroll')
      if (this.recommendedCoursesId) {
        this.raiseEnrollTelementryForSakshamAIGenerated()
      }
      if (this.recommendedCoursesId) {
        this.raiseEnrollTelementryForSakshamAIGenerated()
      }
      const batchData = this.contentReadData && this.contentReadData.batches && this.contentReadData.batches[0]
      if (this.content && this.content.primaryCategory === NsContent.EPrimaryCategory.CURATED_PROGRAM) {
        this.autoEnrollCuratedProgram(NsContent.ECourseCategory.CURATED_PROGRAM, batchData)
      } else if (this.content && this.content.courseCategory === NsContent.ECourseCategory.MODERATED_PROGRAM) {
        let moderatedBatchData: any
        if (this.batchData && this.batchData.content && this.batchData.content.length > 1) {
          moderatedBatchData = this.selectedBatchData && this.selectedBatchData.content && this.selectedBatchData.content[0]
        } else {
          moderatedBatchData = this.batchData && this.batchData.content && this.batchData.content[0]
        }
        this.autoEnrollCuratedProgram(NsContent.ECourseCategory.MODERATED_PROGRAM, moderatedBatchData)
      } else if (this.content && this.content.courseCategory === NsContent.ECourseCategory.LEARNING_PATHWAY) {
        this.autoEnrollLearningPathway(batchData)
      } else {
        this.autoAssignEnroll()
      }
    }
    this.contentViewEventForNetCore('enroll')
  }

  public autoEnrollLearningPathway(batchData: any) {
    let batchId = batchData?.batchId
    if (batchId) {
      this.contentSvc.autoEnrollLP(this.content?.identifier).subscribe((res: any) => {
        if (res) {
          this.navigateToPlayerPage(batchId)
          this.enrollBtnLoading = false
        }
      }, (err: any) => {
        let errMsg = err?.error?.params?.errmsg || err?.params?.errmsg || 'Something went wrong'
        if (errMsg?.includes('course.') && this.content?.courseCategory) {
          errMsg = errMsg.replace('course.', this.content?.courseCategory) + '.';
        }
        this.snackBar.open(errMsg)
        this.enrollBtnLoading = false
      })
    } else {
      this.snackBar.open('No batches found')
      this.enrollBtnLoading = false
    }
  }

  public autoEnrollCuratedProgram(programType: any, batchData: any) {
    if (!batchData) {
      this.enrollBtnLoading = false
      this.snackBar.open('No bacthes found')
      return
    }
    if (this.content && this.content.identifier) {
      let userId = ''
      if (this.configSvc.userProfile && this.configSvc.userProfile.userId) {
        userId = this.configSvc.userProfile.userId
      }
      const req = {
        request: {
          userId,
          programId: this.content.identifier,
          // as of now curated program only one batch is coming need to check and modify
          batchId: batchData?.batchId,
        },
      }
      this.contentSvc.autoAssignCuratedBatchApi(req, programType).subscribe(
        (data: NsContent.IBatchListResponse) => {
          if (data) {
            if (programType === NsContent.ECourseCategory.MODERATED_PROGRAM && batchData.endDate) {
              this.batchData = {
                content: [batchData],
                enrolled: true,
              }
              this.routerChangeHandler(true)
              setTimeout(() => {
                // this.getUserEnrollmentList()
                this.checkIfUserEnrolled()
              }, 2000)
            } else {
              this.navigateToPlayerPage(req.request.batchId)
            }
          }
        },
        (_error: any) => {
          // console.log('_error', _error)
          // if(_error && _error.error && _error.error.params && _error.error.params.err && _error.error.params.err.errmsg) {
          this.snackBar.open(_.get(_error, 'error.params.errmsg') || 'Please try again later')
          // }
          this.enrollBtnLoading = false
        }
      )
    }
  }

  public autoAssignEnroll() {
/*************  ✨ Windsurf Command ⭐  *************/
  /**
   * If the user is not enrolled in the course, auto-assigns a batch and navigates to the player page.
   * If the user is already enrolled, does nothing.
   */
/*******  6d94c646-254c-44d6-a7c3-90bdb9507318  *******/    if (this.baseContentReadData && this.baseContentReadData.identifier && this.isApiEnabled('contentEnroll', '/apis/protected/v8/cohorts/user/autoenrollment')) {
      this.contentSvc.autoAssignBatchApi(this.baseContentReadData.identifier, this.selectedLanguage).subscribe(
        (data: NsContent.IBatchListResponse) => {
          this.batchData = {
            content: data.content,
            enrolled: true,
          }
          const batchId = this.getBatchId()
          if (batchId) {
            this.navigateToPlayerPage(batchId)
          }
          // this.enrollBtnLoading = false
        },
        (_error: any) => {
          this.snackBar.open(_.get(_error, 'error.params.errmsg') || 'Please try again later')
          this.enrollBtnLoading = false
        }
      )
    }
  }

  async navigateToPlayerPage(batchId: string) {
    if (this.content) {
      this.enrollBtnLoading = true
      let firstPlayableContent
      if (this.content && this.content.identifier === this.selectedLanguage.identifier) {
        firstPlayableContent = this.contentSvc.getFirstChildInHierarchy(this.content)
      } else {
        // fetch hierarchy for the selected language in popup first, then get first playable content and redirect to it
        await this.fetchContentHierarchy(this.selectedLanguage.identifier)
        firstPlayableContent = this.contentSvc.getFirstChildInHierarchy(this.content)
      }
      let primaryCategory
      if (this.content.secureSettings !== undefined) {
        primaryCategory = 'Learning Resource'
      } else {
        primaryCategory = firstPlayableContent.primaryCategory || this.content.primaryCategory
      }
      this.firstResourceLink = this.getResumeUrl(firstPlayableContent, batchId, primaryCategory)
      this.router.navigate([`${this.firstResourceLink.url}`], { queryParams: { ...this.firstResourceLink.queryParams, fromAITutor: this.fromAITutor } })
    }
  }

  public fetchBatchDetails() {
    if (this.content && this.content.identifier) {
      const req = this.contentSvc.getCourseBatchesRequest(this.content.identifier)
      this.contentSvc.fetchCourseBatches(req).subscribe(
        (data: NsContent.IBatchListResponse) => {
          this.batchData = data
          this.batchData.enrolled = false
          if (this.contentReadData?.primaryCategory === this.primaryCategory.BLENDED_PROGRAM) {
            if (this.batchData.content && this.batchData.content.length > 0) {
              this.batchData.allBatchesExpired = this.batchData.content.every(
                (batch: any) => !this.handleEnrollmentEndDate(batch)
              )
            }
          }
          this.tocSvc.setBatchData(this.batchData)
          this.routerChangeHandler(false)
        },
        (error: any) => {
          this.loggerSvc.error('CONTENT HISTORY FETCH ERROR > ', error)
        },
      )
    }
  }

  get isBatchFull(): boolean {
    const enrolled = this.selectedBatchData?.userCount?.enrolled
    const currentBatchSize = this.selectedBatchData?.content?.[0]?.batchAttributes?.currentBatchSize
    return (enrolled !== undefined && currentBatchSize !== undefined && enrolled >= currentBatchSize)
  }

  get showLimitedSeatsMsg(): boolean {
    const enrolled = this.selectedBatchData?.userCount?.enrolled
    const currentBatchSize = this.selectedBatchData?.content?.[0]?.batchAttributes?.currentBatchSize
    if (enrolled === undefined || currentBatchSize === undefined || currentBatchSize === 0) {
      return false
    }
    return !this.isBatchFull && (enrolled >= (currentBatchSize * 0.8))
  }


  scrollToTop() {
    (function smoothscroll() {
      const currentScroll = document.documentElement.scrollTop || document.body.scrollTop
      if (currentScroll > 0) {
        // window.requestAnimationFrame(smoothscroll)
        // window.scrollTo(0, currentScroll - (currentScroll / 5))
        window.scrollTo({
          top: 0,
          behavior: 'smooth',
        })
      }
    })()
  }

  public getCompetencies(competencies: any) {
    const competenciesArray = JSON.parse(competencies)
    const competencyStringArray: any[] = []
    competenciesArray.map((c: any) => {
      competencyStringArray.push(c.name)
    })
    return competencyStringArray
  }

  get showIntranetMsg() {
    if (this.isMobile) {
      return true
    }
    return this.showIntranetMessage
  }

  get showStart() {
    return this.tocSvc.showStartButton(this.content)
  }

  get isPostAssessment(): boolean {
    if (!(this.tocConfig && this.tocConfig.postAssessment)) {
      return false
    }
    if (this.content) {
      return (
        this.content.primaryCategory === NsContent.EPrimaryCategory.COURSE &&
        this.content.learningMode === 'Instructor-Led'
      )
    }
    return false
  }

  get isMobile(): boolean {
    return this.utilitySvc.isMobile
  }

  get showSubtitleOnBanner() {
    return this.tocSvc.subtitleOnBanners
  }

  getActiveBatches(batch: any) {
    const enrollmentEndDate = dayjs(_.get(batch, 'enrollmentEndDate')).format('YYYY-MM-DD')
    const systemDate = dayjs(this.serverDate || new Date()).format('YYYY-MM-DD')
    return (enrollmentEndDate && enrollmentEndDate !== 'Invalid Date') ?
      !(dayjs(enrollmentEndDate).isBefore(systemDate, 'day')) : false
  }


  public handleEnrollmentEndDate(batch: any) {
    const enrollmentEndDate = dayjs(_.get(batch, 'enrollmentEndDate')).format('YYYY-MM-DD')
    const systemDate = dayjs(this.serverDate || new Date()).format('YYYY-MM-DD')
    return (enrollmentEndDate && enrollmentEndDate !== 'Invalid Date') ?
      (dayjs(enrollmentEndDate).isSame(systemDate, 'day') || dayjs(enrollmentEndDate).isAfter(systemDate)) : false
  }

  private openSnackbar(primaryMsg: string, duration: number = 5000) {
    this.snackBar.open(primaryMsg, 'X', {
      duration,
    })
  }

  get showInstructorLedMsg() {
    return (
      this.showActionButtons &&
      this.content &&
      this.content.learningMode === 'Instructor-Led' &&
      !this.content.children.length &&
      !this.content.artifactUrl
    )
  }

  get isHeaderHidden() {
    return this.isResource && this.content && !this.content.artifactUrl.length
  }

  get showActionButtons() {
    return (
      this.actionBtnStatus !== 'wait' &&
      this.content &&
      this.content.status !== 'Deleted' &&
      this.content.status !== 'Expired'
    )
  }

  get showButtonContainer() {
    return (
      this.actionBtnStatus === 'grant' &&
      !(this.isMobile && this.content && this.content.isInIntranet) &&
      !(
        this.content &&
        this.content.contentType === 'Course' &&
        this.content.children.length === 0 &&
        !this.content.artifactUrl
      ) &&
      !(this.content && this.content.contentType === 'Resource' && !this.content.artifactUrl)
    )
  }

  private getResumeDataFromList(type?: string): any | void {
    const resumeCopy = [...this.resumeData]
    if (resumeCopy && resumeCopy.length) {
      if (!type) {
        // tslint:disable-next-line:max-line-length

        const lastItem = resumeCopy && resumeCopy.sort((a: any, b: any) =>
          new Date(b.lastAccessTime).getTime() - new Date(a.lastAccessTime).getTime()).shift()
        return {
          identifier: lastItem.contentId,
          mimeType: lastItem.progressdetails && lastItem.progressdetails.mimeType,
        }
      }
      const firstItem = resumeCopy && resumeCopy.length && resumeCopy[0]
      return {
        identifier: firstItem.contentId,
        mimeType: firstItem.progressdetails && firstItem.progressdetails.mimeType,
      }
    }
    return {}
  }

  private modifySensibleContentRating() {
    if (
      this.content &&
      this.content.averageRating &&
      typeof this.content.averageRating !== 'number'
    ) {
      this.content.averageRating = (this.content.averageRating as any)[this.configSvc.rootOrg || '']
    }
    if (this.content && this.content.totalRating && typeof this.content.totalRating !== 'number') {
      this.content.totalRating = (this.content.totalRating as any)[this.configSvc.rootOrg || '']
    }
  }

  private getLearningUrls() {
    if (this.content) {
      this.isPracticeVisible = Boolean(
        this.tocSvc.filterToc(this.content, NsContent.EFilterCategory.PRACTICE),
      )

      this.isAssessVisible = Boolean(
        this.tocSvc.filterToc(this.content, NsContent.EFilterCategory.ASSESS),
      )

      const firstPlayableContent = this.contentSvc.getFirstChildInHierarchy(this.content)
      let primaryCategory
      if (this.content.secureSettings !== undefined) {
        primaryCategory = 'Learning Resource'
      } else {
        primaryCategory = firstPlayableContent.primaryCategory || this.content.primaryCategory
      }
      this.firstResourceLink = this.getResumeUrl(firstPlayableContent, null, primaryCategory)

      /* tslint:disable-next-line */
      // if (firstPlayableContent.optionalReading && firstPlayableContent.primaryCategory === 'Learning Resource') {
      //   this.updateProgress(2, firstPlayableContent.identifier)
      // }
    }
  }

  private assignPathAndUpdateBanner(url: string) {
    const path = url.split('/').pop()
    if (path && this.validPaths.has(path)) {
      this.routePath = path
      this.updateBannerUrl()
    }
  }

  private updateBannerUrl() {
    if (this.banners) {
      this.bannerUrl = this.domSanitizer.bypassSecurityTrustStyle(
        `url(${this.banners[this.routePath]})`,
      )
    }
  }

  playIntroVideo() {
    if (this.content) {
      this.dialog.open(AppTocDialogIntroVideoComponent, {
        data: this.content.introductoryVideo,
        height: '350px',
        width: '620px',
      })
    }
  }

  get sanitizedIntroductoryVideoIcon() {
    if (this.content && this.content.introductoryVideoIcon) {
      return this.domSanitizer.bypassSecurityTrustStyle(`url(${this.content.introductoryVideoIcon})`)
    }
    return null
  }

  private fetchExternalContentAccess() {
    if (this.content && this.content.registrationUrl) {
      if (!this.forPreview) {
        this.externalContentFetchStatus = 'fetching'
        this.registerForExternal = false
        this.tocSvc.fetchExternalContentAccess(this.content.identifier).subscribe(
          data => {
            this.externalContentFetchStatus = 'done'
            this.registerForExternal = data.hasAccess
          },
          _error => {
            this.externalContentFetchStatus = 'done'
            this.registerForExternal = false
          },
        )
      } else {
        this.externalContentFetchStatus = 'done'
        this.registerForExternal = true
      }
    }
  }

  getRatingIcon(ratingIndex: number): 'star' | 'star_border' | 'star_half' {
    if (this.content && this.content.averageRating) {
      const avgRating = this.content.averageRating
      const ratingFloor = Math.floor(avgRating)
      if (ratingIndex <= ratingFloor) {
        return 'star'
      }
      if (ratingFloor === ratingIndex - 1 && avgRating % 1 > 0) {
        return 'star_half'
      }
    }
    return 'star_border'
  }

  private checkRegistrationStatus() {
    const source = (this.content && this.content.sourceShortName) || ''
    if (
      !this.forPreview &&
      !this.isRegistrationSupported &&
      this.checkRegistrationSources.has(source)
    ) {
      this.contentSvc
        .getRegistrationStatus(source)
        .then(res => {
          if (res.hasAccess) {
            this.actionBtnStatus = 'grant'
          } else {
            this.actionBtnStatus = 'reject'
            if (res.registrationUrl && this.content) {
              this.content.registrationUrl = res.registrationUrl
            }
          }
        })
        .catch(_err => { })
    } else {
      this.actionBtnStatus = 'grant'
    }
  }

  generateQuery(type: 'RESUME' | 'START_OVER' | 'START'): { [key: string]: string } {
    if (this.firstResourceLink && (type === 'START' || type === 'START_OVER')) {
      let qParams: { [key: string]: string } = {
        ...this.firstResourceLink.queryParams,
        viewMode: type,
        batchId: this.getBatchId(),
      }
      if (this.contextId && this.contextPath) {
        qParams = {
          ...qParams,
          collectionId: this.contextId,
          collectionType: this.contextPath,
        }
      }
      if (this.forPreview) {
        delete qParams.viewMode
      }
      qParams = {
        ...qParams,
        channelId: this.channelId,
      }
      return qParams
    }

    if (this.resumeDataLink && type === 'RESUME') {
      let qParams: { [key: string]: string } = {
        ...this.resumeDataLink.queryParams,
        batchId: this.getBatchId(),
        viewMode: 'RESUME',
        // courseName: this.content ? this.content.name : '',
      }
      if (this.contextId && this.contextPath) {
        qParams = {
          ...qParams,
          collectionId: this.contextId,
          collectionType: this.contextPath,
        }
      }
      if (this.forPreview) {
        delete qParams.viewMode
      }
      qParams = {
        ...qParams,
        channelId: this.channelId,
      }
      return qParams
    }
    if (this.forPreview) {
      return {}
    }
    return {
      batchId: this.getBatchId(),
      viewMode: type,
    }
  }

  get isInIFrame(): boolean {
    try {
      return window.self !== window.top
    } catch (e) {
      return true
    }
  }

  openFeedbackDialog(content: any): void {
    if (this.tocConfig?.uiVisibility?.rightPanel?.starRating === false) {
      return
    }
    const dialogRef = this.dialog.open(ContentRatingV2DialogComponent, {
      width: '768px',
      data: { content, userId: this.userId, userRating: this.userRating },
    })

    dialogRef.afterClosed().subscribe((result: any) => {
      if (result) {
        this.getUserRating(true)
        // this.getUserEnrollmentList()
        this.checkIfUserEnrolled()
        this.resetRatingsService.setRatingServiceUpdate(true)
      }
    })
  }

  updateProgress(status: number, resourceId: any) {
    const collectionId = this.route.snapshot.params.id ?
      this.route.snapshot.params.id : ''
    const batchId = this.route.snapshot.queryParams.batchId ?
      this.route.snapshot.queryParams.batchId : ''
    const isPreAssessment = this.route.snapshot.queryParams.preAssessment
    if (isPreAssessment) {
      return this.viewerSvc
        .realTimeProgressUpdateForPreAssessmentQuiz(resourceId, status)

    }
    return this.viewerSvc.realTimeProgressUpdateQuiz(resourceId, collectionId, batchId, status)
  }

  getProgramDuration(batchData: any) {
    if (batchData) {
      const startDate = dayjs(dayjs(batchData.startDate).format('YYYY-MM-DD'))
      const endDate = dayjs(dayjs(batchData.endDate).format('YYYY-MM-DD'))
      // adding 1 to include the start date
      return (endDate.diff(startDate, 'days') + 1)
    }
    return ''
  }

  withdrawOrEnroll(data: string) {
    if (data === NsContent.WFBlendedProgramStatus.INITIATE) {
      this.fetchUserWFForBlended()
    }
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

  public handleParseJsonData(s: any) {
    try {
      const parsedString = JSON.parse(s)
      return parsedString
    } catch {
      return []
    }
  }

  handleNavigateToReviews(): void {
    const elementToView = document.getElementById('reviewContainer') as any

    if (elementToView) {
      window.scrollTo({
        top: elementToView.offsetTop,
        behavior: 'smooth',
      })
    }
  }

  raiseCertIntreactTelemetry() {
    this.events.raiseInteractTelemetry(
      {
        type: WsEvents.EnumInteractTypes.CLICK,
        id: 'view-certificate',
        subType: WsEvents.EnumInteractSubTypes.CERTIFICATE,
      },
      {
        id: this.certId,   // id of the certificate
        type: WsEvents.EnumInteractSubTypes.CERTIFICATE,
      })
  }

  translateLabels(label: string, type: any) {
    return this.langtranslations.translateLabel(label, type, '')
  }



  getLastPlayedResource() {
    let firstPlayableContent
    let resumeDataV2: any
    if (this.resumeData && this.resumeData.length > 0 && this.content) {
      if (this.content.completionPercentage === 100) {
        resumeDataV2 = this.getResumeDataFromList('start')
      } else {
        resumeDataV2 = this.getResumeDataFromList()
      }
      this.expandThePath(resumeDataV2.identifier)
    } else {
      if (this.content) {
        firstPlayableContent = this.contentSvc.getFirstChildInHierarchy(this.content)
        this.expandThePath(firstPlayableContent.identifier)

      }
    }
  }

  expandThePath(resourceId: string) {
    if (this.content && resourceId) {
      const path = this.utilitySvc.getPath(this.content, resourceId)
      this.pathSet = new Set(path.map((u: { identifier: any }) => u.identifier))
    }
  }

  raiseEnrollmentTelemetry(action: 'enroll' | 'reenroll') {
    this.events.raiseInteractTelemetry(
      {
        type: 'click',
        subType: action,
        id: this.content ? this.content.identifier : '',
      },
      {
        id: this.content ? this.content.identifier : '',
        type: this.content ? this.content.primaryCategory : '',
      },
      {
        pageIdExt: `btn-${action}`,
        module: WsEvents.EnumTelemetrymodules.LEARN,
      }
    )
  }

  raiseEnrollTelementryForSakshamAIGenerated() {
    this.events.raiseInteractTelemetry(
      {
        type: 'click',
        subType: 'enroll',
        id: this.content ? this.content.identifier : '',
        target: {
          id: this.recommendedCoursesId,
          ver: "1.0",
          type: "igot-ai"
        },
      } as any,
      {
        id: this.content ? this.content.identifier : '',
        type: this.content ? this.content.primaryCategory : '',
      },
      {
        pageId: `/app/toc/${this.content?.identifier}/overview_btn-enroll`,
        module: WsEvents.EnumTelemetrymodules.CONTENT,
      }
    )
  }

  onClickOfShare() {
    this.enableShare = true
    this.raiseTelemetryForShare('shareContent')
  }

  /* tslint:disable */
  raiseTelemetryForShare(subType: any) {
    this.events.raiseInteractTelemetry(
      {
        type: 'click',
        subType,
        id: this.content ? this.content.identifier : '',
      },
      {
        id: this.content ? this.content.identifier : '',
        type: this.content ? this.content.primaryCategory : '',
      },
      {
        pageIdExt: `btn-${subType}`,
        module: WsEvents.EnumTelemetrymodules.CONTENT,
      }
    )
  }

  resetEnableShare() {
    this.enableShare = false
  }

  translateLabel(label: string, type: any) {
    if (label && type) {
      return this.langtranslations.translateLabel(label, type, '')
    }
  }

  ngOnDestroy() {
    if (this.routeSubscription) {
      this.routeSubscription.unsubscribe()
    }
    if (this.batchSubscription) {
      this.batchSubscription.unsubscribe()
    }
    if (this.batchDataSubscription) {
      this.batchDataSubscription.unsubscribe()
    }
    this.tocSvc.analyticsFetchStatus = 'none'
    if (this.routerParamSubscription) {
      this.routerParamSubscription.unsubscribe()
    }
    if (this.selectedBatchSubscription) {
      this.selectedBatchSubscription.unsubscribe()
    }
    if (this.resumeDataSubscription) {
      this.resumeDataSubscription.unsubscribe()
    }
    if (this.timerUnsubscribe) {
      this.timerUnsubscribe.unsubscribe()
    }
    if (this.hashmapUpdatedSubscription) {
      this.hashmapUpdatedSubscription.unsubscribe()
    }

    // Clear content data to prevent stale data when navigating between contents
    this.tocSvc.resetContentData()
  }

  programEnrollCall(batchData: any) {
    this.autoEnrollCuratedProgram(NsContent.ECourseCategory.MODERATED_PROGRAM, batchData)
  }

  raiseTelemetryForPublic($event: any) {
    // Check if we should first prevent navigation to player page
    const shouldPreventNavigation = this.shouldShowSurveyPopup()
    if (shouldPreventNavigation) {
      $event.preventDefault()
      $event.stopPropagation()
    }

    this.events.raiseInteractTelemetry(
      {
        type: 'click',
        id: "view-assessment",
        subType: "anonymous-assessment",
      }, {},
      {
        module: 'Landing Page',
      })

    if (shouldPreventNavigation) {
      // Prepare navigation details
      const navigationUrl = (this.resumeData && !this.certData) ? this.resumeDataLink?.url : this.firstResourceLink?.url
      const queryParams = (this.resumeData && !this.certData) ? this.generateQuery('RESUME') : this.generateQuery('START')

      // Open survey popup directly with navigation details
      if (navigationUrl) {
        this.openPublicSurveyPopup(navigationUrl, queryParams)
      }
      return false
    }
  }

  shouldShowSurveyPopup(): boolean {
    // Single source of truth for survey popup condition
    // Check if it's public view and content is a case study
    return this.forPreview && this.content && this.contentReadData
      && this.contentReadData.courseCategory === NsContent.ECourseCategory.CASE_STUDY
  }


  async checkIfUserEnrolled() {
    this.contentLibSvc.oneStepResumeEnable = false
    this.enrollBtnLoading = true
    this.tocSvc.contentLoader.next(true)
    // only for  resource
    // tslint:disable-next-line
    if (this.baseContentReadData && this.baseContentReadData.identifier && this.baseContentReadData.primaryCategory !== this.primaryCategory.COURSE &&
      this.baseContentReadData.primaryCategory !== this.primaryCategory.PROGRAM &&
      this.baseContentReadData.primaryCategory !== this.primaryCategory.MANDATORY_COURSE_GOAL &&
      this.baseContentReadData.primaryCategory !== this.primaryCategory.STANDALONE_ASSESSMENT &&
      this.baseContentReadData.primaryCategory !== this.primaryCategory.BLENDED_PROGRAM &&
      this.baseContentReadData.primaryCategory !== this.primaryCategory.CURATED_PROGRAM) {
      // const collectionId = this.isResource ? '' : this.baseContentReadData.identifier
      return this.getContinueLearningData(this.baseContentReadData.identifier)
    }

    let enrolledCourse: NsContent.ICourse | undefined
    if (this.content && this.baseContentReadData && this.baseContentReadData.identifier && !this.forPreview) {
      if (this.userEnrollmentList && this.userEnrollmentList.length) {
        enrolledCourse = this.userEnrollmentList.find((course: any) => {
          const identifier = this.baseContentReadData && this.baseContentReadData.identifier || ''
          if (course.courseId !== identifier) {
            return undefined
          }
          return course
        })
      }

      if(enrolledCourse && !enrolledCourse.active){
        this.isUnEnrolled = true
      }

      // If current course is present in the list of user enrolled course
      if (enrolledCourse && enrolledCourse.batchId) {
        this.resumeDataSubscription = this.tocSvc.resumeData.subscribe((res: any) => {
          if (res) {
            this.resumeData = res
            this.getLastPlayedResource()
            this.generateResumeDataLinkNew()
          }
        })
        this.tocSvc.checkModuleWiseData(this.content)
        this.enrolledCourseData = enrolledCourse
        this.isCourseCompletedOnThisMonth()
        this.currentCourseBatchId = enrolledCourse.batchId
        // this.downloadCert(enrolledCourse.issuedCertificates)
        if (enrolledCourse && enrolledCourse.issuedCertificates &&
          enrolledCourse.issuedCertificates.length) {
          const certificate: any = enrolledCourse.issuedCertificates.sort((a: any, b: any) =>
            new Date(b.lastIssuedOn).getTime() - new Date(a.lastIssuedOn).getTime())
          const certId = certificate[0].identifier
          this.certId = certId
          if (this.content) {
            this.content['certificateObj'] = {
              certId,
              certData: '',
            }
          }
        }
        // if enrolled course is completed then to make all languages courses as well as all content as completed
        if (this.contentReadData && this.contentReadData.courseCategory !== NsContent.ECourseCategory.LEARNING_PATHWAY && enrolledCourse.status === 2) {
          this.content['completionPercentage'] = 100
          this.content['completionStatus'] = 2
          await this.tocSvc.mapCompletionChildPercentageProgram(this.content)
          let contentLag = this.contentLangSvc.getContentLanguage(this.contentReadData)
          this.getContinueLearningData(this.baseContentReadData.identifier, enrolledCourse.batchId, contentLag)
          this.enrollBtnLoading = false
          this.tocSvc.mapModuleCount(this.content)
          this.checkForCompletionSurveyTrigger()
        } else {
          if (this.contentReadData && this.contentReadData.cumulativeTracking && this.contentReadData.courseCategory !== NsContent.ECourseCategory.LEARNING_PATHWAY) {
            await this.tocSvc.mapCompletionPercentageProgram(this.content, this.userEnrollmentList)
            this.checkForCompletionSurveyTrigger()
            this.resumeDataSubscription = this.tocSvc.resumeData.subscribe((res: any) => {
              if (res) {
                this.resumeData = res
                this.getLastPlayedResource()
                this.generateResumeDataLinkNew()
              }
            })

            this.enrollBtnLoading = false
            // this.tocSvc.contentLoader.next(false)
          } else {
            if (this.contentReadData && this.contentReadData.courseCategory !== NsContent.ECourseCategory.LEARNING_PATHWAY) {
              let contentLag = this.contentLangSvc.getContentLanguage(this.contentReadData)
              this.getContinueLearningData(this.baseContentReadData.identifier, enrolledCourse.batchId, contentLag)
              this.content['completionPercentage'] = enrolledCourse.completionPercentage
              this.tocSvc.mapModuleCount(this.content)
            }
            this.enrollBtnLoading = false
            // this.tocSvc.contentLoader.next(false)
          }
        }
        if (this.baseContentReadData?.courseCategory === NsContent.ECourseCategory.LEARNING_PATHWAY) {
          // this.appTocV2Svc.mapContentHierarchyProgressUpdate(this.content,this.userEnrollmentList)
          console.log('mapping progress for learning pathway', this.content)
          this.tocSvc.callHirarchyProgressHashmap(this.content)
          console.log('mapped progress for learning pathway', this.tocSvc.hashmap)
          this.tocSvc.computeMilestoneLockingStatus(true)
          this.syncMilestoneLockStatus()

        }
        this.batchData = {
          content: [enrolledCourse.batch],
          enrolled: true,
        }
        this.tocSvc.setBatchData(this.batchData)
        this.tocSvc.getSelectedBatchData(this.batchData)
        this.tocSvc.mapSessionCompletionPercentage(this.batchData, this.resumeData)
        this.routerChangeHandler(true)
        this.tocSvc.contentLoader.next(false)
      } else {
        this.tocSvc.checkModuleWiseData(this.content)
        this.tocSvc.mapModuleCount(this.content)
        // It's understood that user is not already enrolled
        // Fetch the available batches and present to user
        if (this.content.primaryCategory === this.primaryCategory.COURSE
          || this.content.primaryCategory !== this.primaryCategory.PROGRAM) {
          // Disabling auto enrollment to batch
          if (this.content.primaryCategory === this.primaryCategory.BLENDED_PROGRAM) {
            this.fetchBatchDetails()
          }
        } else {
          this.fetchBatchDetails()
        }
        this.tocSvc.callHirarchyProgressHashmap(this.content)
        // For Learning Pathways, compute milestone locking when not enrolled (all locked)
        if (this.baseContentReadData?.courseCategory === NsContent.ECourseCategory.LEARNING_PATHWAY) {
          this.tocSvc.computeMilestoneLockingStatus(false)
          this.syncMilestoneLockStatus()
        }
        this.enrollBtnLoading = false
        this.tocSvc.contentLoader.next(false)
      }
    }

    this.skeletonLoader = false
  }

  bindCompletionPercentage() {
    let completionPercentage = 0
    let completionStatus = 0
    if (this.languageMapProgress && Object.keys(this.languageMapProgress).length) {
      let langPercentage = this.languageMapProgress[this.selectedLanguage.langId] || 0
      completionPercentage = langPercentage
      completionStatus = langPercentage >= 100 ? 2 : 0
    } else {
      let enrolledData = this.tocSvc.findEnrolmentByCollectionId(this.userEnrollmentList, (this.baseContentReadData?.identifier || ''))
      if (enrolledData && enrolledData.completionPercentage) {
        completionPercentage = enrolledData.completionPercentage
        completionStatus = enrolledData.status
      }
    }

    if (this.content) {
      this.content.completionPercentage = completionPercentage
      this.content.completionStatus = completionStatus
    }
  }

  handleAcceptRelevent() {
    this.saveFeedback('', 1)
  }

  handleDeclineRelevent() {
    const dialogRef = this.dialog.open(NonReleventFeedbackDialogComponent, {
      disableClose: true,
      width: '502px',
      panelClass: ['relevent-feedback-dialog'],
    })
    dialogRef.afterClosed().subscribe((result: any) => {
      if (result) {
        this.saveFeedback(result, 0)
        dialogRef.close()
      } else {
        dialogRef.close()
      }
    })
  }

  contentViewEventForNetCore(eventType: any) {
    if (this.configSvc.netcoreConfig && this.configSvc.netcoreConfig.netcoreWebConfig  // NOSONAR
      && this.configSvc.netcoreConfig.netcoreWebConfig.isActive // NOSONAR
      && this.configSvc.netcoreConfig.netcoreWebConfig.events // NOSONAR
      && this.configSvc.netcoreConfig.netcoreWebConfig.events.content_view // NOSONAR
      && this.configSvc.netcoreConfig.netcoreWebConfig.events.content_view.isActive // NOSONAR
    ) {
      let payload: any = {}
      // if (this.configSvc && this.configSvc.unMappedUser && this.configSvc.unMappedUser.identifier) { // NOSONAR
      //   payload['pk^userid'] = this.configSvc.unMappedUser.identifier.trim().toLowerCase()
      // }
      if (this.content && this.content.name) {
        payload['content_name'] = this.content.name
      }
      if (this.content && this.content.courseCategory) {
        payload['content_category'] = this.content.courseCategory
      }
      if (this.content && this.content.identifier) {
        payload['content_id'] = this.content.identifier
      }
      // if(this.content && this.content.name) {
      payload['content_url'] = window.location.href
      // }
      if (this.content && this.content.appIcon) {
        payload['content_image'] = this.content.appIcon
      }
      if (this.content && this.content.duration) {
        payload['content_duration'] = this.content.duration && Number(this.content.duration) > 0 ? Number(this.content.duration) : 0
      } else {
        payload['content_duration'] = 0
      }
      if (this.content && this.content.avgRating
      ) {
        payload['content_rating'] = this.content.avgRating
        payload['content rating'] = this.content.avgRating
      }
      if (this.content && this.content.totalNoOfRating) {
        payload['no_users_rated'] = this.content.totalNoOfRating
      }
      // if(this.content && this.content.name) {
      payload['learning_path_content'] = this.userEnrollmentList && this.userEnrollmentList.length ? true : false
      payload['learning path content'] = this.userEnrollmentList && this.userEnrollmentList.length ? true : false
      // }
      if (this.content && this.content.source) {
        payload['content_provider_name'] = this.content.source
      }
      // console.log('payload', payload)
      if (eventType === 'view') {
        this.netCoreService.trackEventForContentAndEvent('content_view', this.configSvc.unMappedUser.identifier.trim().toLowerCase(), payload)
      } else if (eventType === 'enroll') {
        this.netCoreService.trackEventForContentAndEvent('content_enrolment', this.configSvc.unMappedUser.identifier.trim().toLowerCase(), payload)
      } else if (eventType === 'complete') {
        this.netCoreService.trackEventForContentAndEvent('content_completion', this.configSvc.unMappedUser.identifier.trim().toLowerCase(), payload)
      }

    }
  }

  secondsToTime(d: any) {
    d = Number(d)
    var h = Math.floor(d / 3600)
    var m = Math.floor(d % 3600 / 60)
    var s = Math.floor(d % 3600 % 60)

    var hDisplay = h > 0 ? h + (h == 1 ? " hour, " : " hours, ") : ""
    var mDisplay = m > 0 ? m + (m == 1 ? " minute, " : " minutes, ") : ""
    var sDisplay = s > 0 ? s + (s == 1 ? " second" : " seconds") : ""
    return hDisplay + mDisplay + sDisplay
  }


  async saveFeedback(comment: string, rating = 0) {
    const payload = {
      "recommendation_id": this.recommendedCoursesId,
      "course_id": this.courseID,
      "rating": rating,
      "comments": comment,
      "user_id": this.configSvc.userProfile?.userId || ''
    }
    const response = await this.contentLibSvc.saveFeedbackSakshamAI(payload).toPromise().catch(() => { })
    if (response && response?.message) {
      this.matSnackbarNew.open(
        'Thank you for your feedback.', 'X',
        { duration: SNACKBAR_DURATION, panelClass: ['success'] }
      )
      this.feedbackGiven = { course_id: this.courseID, rating: rating, comments: comment }

    } else if (!response) {
      this.matSnackbarNew.open(
        'Something is wrong. Please try again later.', 'X',
        { duration: SNACKBAR_DURATION, panelClass: ['error'] }
      )
    }
  }

  playResumeForAI() {
    if (this.content) {
      if (this.firstResourceLink) {
        this.router.navigate([this.firstResourceLink.url], { queryParams: this.firstResourceLink.queryParams })
      }
    }

  }

  enrollUserToAI() {
    this.fromAITutor = true
    this.handleAutoBatchAssign()
  }

  openUnenrollDialog(): void {
    // setTimeout allows mat-menu close animation to finish before
    // the MatDialog overlay opens, preventing the backdrop conflict
    setTimeout(() => {
      const dialogRef = this.dialog.open(UnenrollConfirmDialogComponent, {
        width: '700px',
        disableClose: true,
        panelClass: 'unenroll-dialog-panel',
        data: {
          content: this.contentReadData,
          tocConfig: this.tocConfig,
        },
      })

      dialogRef.afterClosed().subscribe((response: any) => {
        if (response) {
          const requestBody: any = {
            request: {
              courseId: this.contentReadData ? this.contentReadData.identifier : '',
              batchId: this.currentCourseBatchId,
              ...response,
            }
          }
          this.contentSvc.unenrollToCourse(requestBody).subscribe((result: any) => {
            if(result?.responseCode === 'OK') {
              this.userEnrollmentList[0].active = false
              this.enrolledCourseData.active = false
              this.canUnenroll = false
              this.isUnEnrolled = true
              this.openSnackbar('You have been successfully un-enrolled from the course.')
            } else {
              this.openSnackbar('Un-enrollment failed. Please try again later.')
            }
          }, (error: any) => {
            console.error('Un-enrollment error:', error)
            this.openSnackbar('An error occurred while trying to un-enroll. Please try again later.')
          })
        }
      })
    }, 100)
  }

  openSurveyFormPopup(event: boolean) {
    if (event) {
      this.openCompletionSurveyFormPopup()
    }
  }

  generatePreAssessmentQuery(type: 'RESUME' | 'START_OVER' | 'START'): { [key: string]: string } {
    if (this.firstResourceLink && (type === 'START' || type === 'START_OVER')) {
      let qParams: { [key: string]: string } = {
        ...this.firstResourceLink.queryParams,
        viewMode: type,
        batchId: this.getBatchId(),
      }
      if (this.contextId && this.contextPath) {
        qParams = {
          ...qParams,
          collectionId: this.contextId,
          collectionType: this.contextPath,
        }
      }
      if (this.forPreview) {
        delete qParams.viewMode
      }
      qParams = {
        ...qParams,
        channelId: this.channelId,
      }
      return qParams
    }

    if (this.resumeDataLink && type === 'RESUME') {
      let qParams: { [key: string]: string } = {
        ...this.resumeDataLink.queryParams,
        batchId: this.getBatchId(),
        viewMode: 'RESUME',
        // courseName: this.content ? this.content.name : '',
      }
      if (this.contextId && this.contextPath) {
        qParams = {
          ...qParams,
          collectionId: this.contextId,
          collectionType: this.contextPath,
        }
      }
      if (this.forPreview) {
        delete qParams.viewMode
      }
      qParams = {
        ...qParams,
        channelId: this.channelId,
      }
      return qParams
    }
    if (this.forPreview) {
      return {}
    }
    return {
      batchId: this.getBatchId(),
      viewMode: type,
    }
  }

  routeToPreAssessent() {
    if (this.contentReadData) {
      // this.generatePreAssessmentQuery('START')
      let firstResource = this.contentReadData.preEnrolmentResources[0]
      let mimeType = firstResource?.courseCategory === 'Pre Enrolment Assessment' ? 'application/vnd.sunbird.questionset' : firstResource.mimeType
      this.firstResourceLink = viewerRouteGenerator(
        firstResource.identifier,
        mimeType,
        this.contentReadData?.identifier,
        this.contentReadData?.courseCategory,
        this.forPreview,
        this.contentReadData && this.contentReadData.preEnrolmentResources[0]?.primaryCategory || '',
        '',
      )
      let routerLink = this.firstResourceLink?.url
      let queryParams = this.generatePreAssessmentQuery('START')
      queryParams = { ...queryParams, preAssessment: 'true' }
      this.router.navigate([`${routerLink}`], { queryParams })
    }
  }

  private async getPreAssessmentRequired() {
    this.preAssessmentRequiredFlag = false
    if (this.contentReadData?.preEnrolmentResources?.length) {
      this.contentReadData?.preEnrolmentResources?.forEach((item: any) => {
        if (item && item?.isMandatory) {
          this.preAssessmentRequiredFlag = true
        }
      })
    }
  }

  private async getPreAssessmentCompletionStatus() {
    this.preAssessmentCompletionStatus = false
    let preEnrollmentResourcesArr: any = []
    let preEnrollmentMandatoryResourcesArr: any = []
    if (this.contentReadData?.preEnrolmentResources?.length) {
      this.contentReadData?.preEnrolmentResources?.forEach((item: any) => {
        preEnrollmentResourcesArr.push(item?.identifier)
        if (item && item?.isMandatory) {
          preEnrollmentMandatoryResourcesArr.push(item?.identifier)
        }
      })
    }
    if (preEnrollmentResourcesArr && preEnrollmentResourcesArr.length) {
      let req = {
        "request": {
          "contentIds": preEnrollmentResourcesArr,
          "fields": [
          ]
        }
      }
      this.tocSvc.readPreEnrollmentResourcesState(req).subscribe((data: any) => {
        let mandatoryIdsCompleted = []
        if (data && data.result && data.result.contentList && data.result.contentList.length) {
          for (let i = 0; i < data.result.contentList.length; i++) {
            if (data.result.contentList[i]['status'] === 2 && preEnrollmentMandatoryResourcesArr.includes(data.result.contentList[i]['contentId'])) {
              mandatoryIdsCompleted.push(data.result.contentList[i]['contentId'])
            }
          }
          if (preEnrollmentResourcesArr?.length === data.result.contentList?.length) {
            this.preAssessmentCompletionStatus = true
          } else if (mandatoryIdsCompleted.length === preEnrollmentMandatoryResourcesArr.length) {
            this.preAssessmentCompletionStatus = true
          } else {
            this.preAssessmentCompletionStatus = false
          }
        } else {
          this.preAssessmentCompletionStatus = false
        }
      })
    }
  }

  ngOnInit() {
    this.dataTransferSvc.setEnrollData(null)
    this.getServerDateTime()
    this.mobile1200 = window.innerWidth < 1201
    this.getI18NTranslations()
    this.loadLearnerAdvisoryData()
    this.setupSelectedBatchSubscription()
    this.setChannelId()
    this.checkIframeContext()
    this.queryParamsData = this.setupRouteSubscriptions()
    this.setupFragmentSubscription()
    this.setupBatchSubscriptions()
    this.configureDefaultLogo()
    this.configureFeatureFlags()
    this.checkRegistrationStatus()
    this.setupRouterEventSubscription()
    this.getContentCreatorData()
    this.setupHashmapUpdateSubscription()
    this.userId = this.configSvc?.userProfile?.userId || ''
  }

  private initData(data: Data) {
    const initData: any = this.tocSvc.initData(data, true)
    this.setErrorCode(initData.errorCode)
    this.setupBatchControlSubscription()
    this.tocSvc.contentLoader.next(false)

  }

  private setErrorCode(errorCode: NsAppToc.EWsTocErrorCode) {
    this.errorCode = errorCode
    switch (this.errorCode) {
      case NsAppToc.EWsTocErrorCode.API_FAILURE:
      case NsAppToc.EWsTocErrorCode.INVALID_DATA:
      case NsAppToc.EWsTocErrorCode.NO_DATA:
        this.errorWidgetData.widgetData.errorType = ErrorType.internalServer
        break
      default:
        this.errorWidgetData.widgetData.errorType = ErrorType.somethingWrong
        break
    }
  }



  private initializeTocStructure() {
    this.contentParents = {}
    this.tocStructure = {
      assessment: 0,
      course: 0,
      handsOn: 0,
      interactiveVideo: 0,
      learningModule: 0,
      other: 0,
      pdf: 0,
      survey: 0,
      podcast: 0,
      practiceTest: 0,
      finalTest: 0,
      quiz: 0,
      video: 0,
      webModule: 0,
      webPage: 0,
      youtube: 0,
      interactivecontent: 0,
      offlineSession: 0,
      preEnrollmentAssessment: 0,
    }
  }

  private setupBatchControlSubscription() {
    this.batchControl.valueChanges.subscribe((batch: NsContent.IBatch) => {
      if (batch) {
        this.handleBatchEnrollment(batch)
      }
    })
  }

  private handleBatchEnrollment(batch: NsContent.IBatch) {
    this.disableEnrollBtn = true
    let userId = this.configSvc.userProfile?.userId || ''

    const req = {
      request: {
        userId,
        courseId: batch.courseId,
        batchId: batch.batchId,
      },
    }

    this.contentSvc.enrollUserToBatch(req).then((datab: any) => {
      if (datab?.result?.response === 'SUCCESS') {
        this.handleSuccessfulEnrollment(batch)
      } else {
        this.handleEnrollmentFailure()
      }
    })
  }

  private handleSuccessfulEnrollment(batch: NsContent.IBatch) {
    this.batchData = {
      content: [batch],
      enrolled: true,
    }
    this.tocSvc.getSelectedBatchData(this.batchData)
    this.tocSvc.mapSessionCompletionPercentage(this.batchData)

    // CRITICAL: For Learning Pathways, compute milestone locking status after enrollment
    // This ensures milestones are properly locked until pre-assessment is completed
    if (this.baseContentReadData?.courseCategory === 'Learning Pathway') {
      this.tocSvc.callHirarchyProgressHashmap(this.content)
      this.tocSvc.computeMilestoneLockingStatus(true)
      this.syncMilestoneLockStatus()
    }

    this.routerChangeHandler(true)
    this.openSnackbar('Enrolled Successfully!')
    this.disableEnrollBtn = false
  }

  private handleEnrollmentFailure() {
    this.openSnackbar('Something went wrong, please try again later!')
    this.disableEnrollBtn = false
  }

  private loadLearnerAdvisoryData() {
    if (this.route.snapshot.data.pageData && this.route.snapshot.data.pageData.data) {
      this.learnAdvisoryData = this.route.snapshot.data.pageData.data.learnerAdvisory
    }
  }

  private setupSelectedBatchSubscription() {
    this.selectedBatchSubscription = this.tocSvc.getSelectedBatch.subscribe(batchData => {
      this.selectedBatchData = batchData
    })
  }

  private setChannelId() {
    this.channelId = this.telemetryService.telemetryConfig
      ? this.telemetryService.telemetryConfig.channel
      : ''
  }

  private checkIframeContext() {
    try {
      this.isInIframe = window.self !== window.top
    } catch (_ex) {
      this.isInIframe = false
    }
  }

  private setupRouteSubscriptions() {
    let queryParamstemp: any = {}
    if (this.route) {
      this.skeletonLoader = true
      this.routeSubscription = this.route.data.subscribe(async (data: Data) => {
        if (data?.content?.data?.identifier) {
          queryParamstemp = await this.processRouteData(data)
        } else {
          const tempData = {
            content: {
              data: this.inputContent
            }
          }
          queryParamstemp = await this.processRouteData(tempData)
        }
      })
    }
    return queryParamstemp
  }

  private async processRouteData(data: Data) {
    this.courseID = data?.content?.data?.status === 'Retired' ? '' : data.content.data?.identifier
    const initData = this.tocSvc.initData(data, true)
    // Get query parameters
    const queryParamsDataTemp = await this.getQueryParams()
    // Handle multilingual content if mlId is present in query parameters
    if (queryParamsDataTemp.MLId) {
      // Store the original content data for reference
      this.baseContentReadData = initData.content
      // Fetch the multilingual content
      try {
        if (this.baseContentReadData && this.baseContentReadData.identifier === queryParamsDataTemp.MLId) {
          this.contentReadData = initData.content
        } else {
          const success = await this.fetchContentRead(queryParamsDataTemp.MLId)
          if (!success) {
            // If multilingual content fetch fails, fall back to the original content
            this.contentReadData = initData.content
            this.loggerSvc.warn('Failed to load multilingual content, using original content instead')
          }
        }
      } catch (error) {
        // On error, use the original content
        this.contentReadData = initData.content
        this.loggerSvc.error('Error loading multilingual content:', error)
        this.snackBar.open('Failed to load content in selected language', 'X', {
          duration: 3000,
        })
      }
    } else {
      // No multilingual content requested, use the original content
      this.contentReadData = initData.content
      this.baseContentReadData = initData.content
    }
    // Added to make sure this reference was incorrect, assigning again to make sure global variable is properly updated
    this.queryParamsData = queryParamsDataTemp
    this.updateBadgeTooltipText()
    this.loadComprehensiveAssessmentStatus()

    // Continue with the rest of the processing
    this.loadLanguageData()
    await this.getPreAssessmentCompletionStatus()
    await this.getPreAssessmentRequired()
    if (this.preAssessmentRequiredFlag) {
      if (this.preAssessmentCompletionStatus) {
        if (this.baseContentReadData && this.baseContentReadData.primaryCategory === this.primaryCategory.BLENDED_PROGRAM) {
          this.areAllActiveBatchesFull()
        }
      }
    } else {
      if (this.baseContentReadData && this.baseContentReadData.primaryCategory === this.primaryCategory.BLENDED_PROGRAM) {
        this.areAllActiveBatchesFull()
      }
    }


    await this.handleContentPreviewOrEnrollment()

    this.initialrouteData = data
    this.loadBannerAndTocConfig(data)
    this.fetchPostAssessmentStatusIfNeeded()
    this.initData(data)

    // to clear public survey data if any on load,
    // if not cleared then it will be cleared on popup close,
    //  but the teachers notes will be visible on ciming back from player page
    const surveyId = this.environment.publicContentSurveyId || ''
    const courseId = this.contentReadData?.identifier || ''
    this.clearExistingPublicSurveyData(surveyId, courseId)

    return queryParamsDataTemp
  }

  openCompletionSurveyFormPopup() {
    if (this.baseContentReadData && _.get(this.baseContentReadData, 'completionSurveyLink')) {
      const sID = this.baseContentReadData.completionSurveyLink.split('surveys/')
      const surveyId = sID[1]
      const data = {
        surveyId,
        courseName: this.contentReadData?.name || '',
        courseID: this.contentReadData?.identifier || '',
        contextOrgId: this.contentReadData?.createdFor && this.contentReadData?.createdFor.length > 0 ?
          this.contentReadData?.createdFor[0] : '',
        apiConfig: this.tocConfig?.apiConfig,
      }
      const dialogRef = this.dialog.open(CompletionSurveyFormComponent, {
        disableClose: true,
        width: '750px',
        maxWidth: '90vw',
        data: data,
        autoFocus: false,
      })
      dialogRef.afterClosed().subscribe((result) => {
        if (result) {
          this.openConfirmationDialog()
        } else {
          this.lockCertificate = true
        }
      })
    }
  }

  openConfirmationDialog() {
    const dialogData = {
      messages: [
        {
          message: this.translate.instant('apptoc.surveySubmitted'),
          classes: 'dialog-title'
        },
        {
          message: this.translate.instant('apptoc.surveyCompletedCertificateGenerating'),
          classes: 'dialog-description mb-2'
        }
      ],
      iconName: 'check_circle',
      type: 'primary',
      buttonsPositionClass: 'justify-center items-center',
      buttons: [
        {
          classes: 'succes-button width-full',
          text: this.translate.instant('apptoc.returnToProgramPage'),
          response: true
        }
      ]
    }
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: dialogData,
      disableClose: true,
      width: '500px',
      maxWidth: '90vw'
    })
    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.lockCertificate = false
      }
    })
  }

  private loadLanguageData() {
    this.languageList = this.contentLangSvc.getAllContentLanguages(this.contentReadData)
    this.selectedLanguage = this.contentLangSvc.getSelectedLanguage(this.contentReadData)
  }

  private async handleContentPreviewOrEnrollment() {
    if (this.forPreview) {
      await this.loadContentForPreview()
    } else {
      // // If we're working with multilingual content, make sure to fetch its hierarchy
      // if (this.queryParamsData.mlId && this.contentReadData &&
      //     this.contentReadData.identifier === this.queryParamsData.mlId) {
      //   // Fetch content hierarchy for the multilingual content
      //   try {
      //     await this.fetchContentHierarchy(this.contentReadData.identifier);
      //     // After fetching hierarchy, update UI components
      //     this.getLearningUrls();
      //   } catch (error) {
      //     this.loggerSvc.error('Error fetching hierarchy for multilingual content:', error);
      //   }
      // }

      // Continue with regular enrollment flow
      this.fetchUserEnrollmentDataV2()
    }
  }

  private async loadContentForPreview() {
    this.tocSvc.contentLoader.next(true)
    await this.fetchContentHierarchy(this.contentReadData?.identifier || '')
    this.tocSvc.contentLoader.next(false)
    this.tocSvc.checkModuleWiseData(this.content)
    this.skeletonLoader = false
  }

  private loadBannerAndTocConfig(data: Data) {
    this.banners = data?.pageData?.data?.banners || []
    this.tocSvc.subtitleOnBanners = data?.pageData?.data?.subtitleOnBanners || false
    this.tocSvc.showDescription = data?.pageData?.data?.showDescription || false
    this.tocConfig = data?.pageData?.data || {}
    // stash the role-based toc form so the viewer (e.g. course-completion
    // dialog) can read uiVisibility flags — viewer routes don't resolve it
    this.tocSvc.tocPageConfig = this.tocConfig
    if (this.contentReadData?.courseCategory === NsContent.ECourseCategory.LEARNING_PATHWAY) {
      this.kparray = this.tocConfig.karmaPointsLP || [
        {
          "displayButton": "Resume",
          "textBeforeIcon": "earn",
          "points": "25",
          "textAfterPoints": "karmaPoints",
          "textAfterIcon": "byCompletingLP",
          "toolTipText": "lpCompleteTip"
        }
      ]
    } else {
      this.kparray = this.tocConfig.karmaPoints || []

    }
  }

  private fetchPostAssessmentStatusIfNeeded() {
    if (this.content && this.isPostAssessment) {
      this.tocSvc.fetchPostAssessmentStatus(this.content.identifier).subscribe(res => {
        const assessmentData = res.result
        for (const o of assessmentData) {
          if (o.contentId === (this.content && this.content.identifier)) {
            this.showTakeAssessment = o
            break
          }
        }
      })
    }
  }

  private setupFragmentSubscription() {
    this.currentFragment = 'overview'
    this.route.fragment.subscribe((fragment: any) => {
      this.currentFragment = fragment || 'overview'
    })
  }

  private setupBatchSubscriptions() {
    this.batchSubscription = this.tocSvc.batchReplaySubject.subscribe(
      () => this.handleBatchUpdate(),
      () => this.loggerSvc.error('error on batchSubscription')
    )

    this.batchDataSubscription = this.tocSvc.setBatchDataSubject.subscribe(
      () => this.handleBlendedProgramUpdate(),
      () => this.loggerSvc.error('error on batchDataSubscription')
    )
  }

  private handleBatchUpdate() {
    this.fetchBatchDetails()
    if (this.content?.primaryCategory === this.primaryCategory.BLENDED_PROGRAM) {
      this.fetchUserWFForBlended()
    }
  }

  private handleBlendedProgramUpdate() {
    if (this.content?.primaryCategory === this.primaryCategory.BLENDED_PROGRAM) {
      this.fetchUserWFForBlended()
    }
  }

  private configureDefaultLogo() {
    const instanceConfig = this.configSvc.instanceConfig
    if (instanceConfig?.logos?.defaultSourceLogo) {
      this.defaultSLogo = instanceConfig.logos.defaultSourceLogo
    }
  }

  private configureFeatureFlags() {
    if (this.configSvc.restrictedFeatures) {
      this.isGoalsEnabled = !this.configSvc.restrictedFeatures.has('goals')
      this.isRegistrationSupported = this.configSvc.restrictedFeatures.has('registrationExternal')
      this.showIntranetMessage = !this.configSvc.restrictedFeatures.has('showIntranetMessageDesktop')
    }
  }

  private setupRouterEventSubscription() {
    this.isPublic = this.router.url.includes('/public/toc')
    this.routerParamSubscription = this.router.events.subscribe((routerEvent: Event) => {
      if (routerEvent instanceof NavigationEnd) {
        this.assignPathAndUpdateBanner(routerEvent.url)

        this.isPublic = routerEvent.url.includes('/public/toc/')

        // Check if we're on the TOC/overview page for a Learning Pathway
        const isTocPage = routerEvent.url.includes('/app/toc') ||
          routerEvent.url.includes('/overview') ||
          routerEvent.url.includes('/content')


      }
    })
  }



  /**
   * Subscribe to hashmap updates to recompute milestone lock status in real-time
   * This ensures that when progress changes, milestone locks update immediately without page refresh
   */
  private setupHashmapUpdateSubscription() {
    this.hashmapUpdatedSubscription = this.tocSvc.hashmapUpdated$.subscribe((update) => {
      if (update && this.baseContentReadData?.courseCategory === 'Learning Pathway') {
        const isEnrolled = this.userEnrollmentList && this.userEnrollmentList.length > 0
        // Sync content tree's isLocked with the updated hashmap values
        this.syncMilestoneLockStatus()
      }
    })
  }

  canBeUnenroll() {
    if (this.userEnrollmentList?.length > 0) {
      this.canUnenroll = this.baseContentReadData?.identifier === this.userEnrollmentList[0]?.contentId &&
        this.userEnrollmentList[0]?.active && this.userEnrollmentList[0]?.status !== 2
    }
  }


  fetchUserEnrollmentDataV2() {

    const identifier = this.baseContentReadData?.identifier || ''
    if (!identifier) {
      this.loggerSvc.error('Cannot fetch enrollment data: content identifier is missing')
      this.userEnrollmentList = []
      this.checkIfUserEnrolled()
      return
    }
    if (!this.isApiEnabled('enrollmentData', '/apis/proxies/v8/learner/course/v4/user/enrollment/details')) {
      this.userEnrollmentList = []
      this.checkIfUserEnrolled()
      return
    }

    const request = {
      request: {
        retiredCoursesEnabled: true,
        courseId: [identifier]
      }
    }

    this.enrollSvc.fetchEnrollContentData(request).pipe(
      takeUntil(this.destroySubject$),
      switchMap((res: any) => {
        if (res?.result?.courses?.length) {
          this.userEnrollmentList = res.result.courses
          // Check for completed content
          const completedContentData = this.userEnrollmentList.find(
            (el: any) => el.collectionId === this.baseContentReadData?.identifier &&
              el.completionPercentage === 100
          )
          if (completedContentData) {
            this.contentViewEventForNetCore('complete')
          }
          this.canBeUnenroll()
          this.dataTransferSvc.setEnrollData(this.userEnrollmentList)
          if (this.isMultilingual) {
            // in case of back from player we need to check recent language and load
            if (!this.contentLibSvc?.oneStepResumeEnable && this.baseContentReadData?.identifier === this.contentReadData?.identifier) {
              let lang = this.baseContentReadData?.language?.length ? this.baseContentReadData?.language[0] : ''
              let baseContentFromEnrollData = this.userEnrollmentList.find((el: any) => el.collectionId === this.baseContentReadData?.identifier)
              if (lang && baseContentFromEnrollData && baseContentFromEnrollData?.recent_language?.toLowerCase() !== lang) {
                let localLang = this.contentLangSvc.getRequiredLanguageDetails(this.baseContentReadData, baseContentFromEnrollData?.recent_language)
                if (localLang && Object.keys(localLang).length) {
                  this.processLanguageSelection(this.contentLangSvc.getRequiredLanguageDetails(this.baseContentReadData, baseContentFromEnrollData?.recent_language))
                } else {
                  this.processLanguageSelection(this.contentLangSvc.getSelectedLanguage(this.contentReadData))
                }
              }
              return of(false)
            } else {
              // Always call fetchContentHierarchy first
              return from(this.fetchContentHierarchy(this.contentReadData?.identifier || ''))
            }
          } else {
            // Always call fetchContentHierarchy first
            return from(this.fetchContentHierarchy(this.contentReadData?.identifier || ''))
          }

        } else {
          this.userEnrollmentList = []
          // Check if we have content ID from either content or contentReadData
          const contentId = this.contentReadData?.identifier || this.baseContentReadData?.identifier || ''
          if (!contentId) {
            this.loggerSvc.error('Cannot fetch hierarchy: content identifier is missing')
            return of(false)
          }
          // Fetch hierarchy content for additional data
          return from(this.fetchContentHierarchy(contentId))
        }
      }),
      // Add catchError here to handle errors from fetchContentHierarchy
      catchError(error => {
        this.loggerSvc.error('Error in enrollment data processing', error)
        return of(false)
      })
    ).subscribe({
      next: () => {
        if (this.userEnrollmentList?.length && this.contentLibSvc?.oneStepResumeEnable) {
          this.handleOneStepResume()
          this.checkIfUserEnrolled()
        } else {
          this.checkIfUserEnrolled()
        }
      },
      error: (error) => {
        this.loggerSvc.error('Failed to fetch user enrollment data', error)
        this.userEnrollmentList = []
        this.checkIfUserEnrolled()
      },
      complete: () => {
        // Optional completion handler if needed
      }
    })
  }

  private async handleOneStepResume() {
    try {
      if (!this.content) {
        this.loggerSvc.error('Content not available for one-step resume')

      }

      const foundContent = this.userEnrollmentList.find(
        (el: any) => el.collectionId === this.baseContentReadData?.identifier
      )

      if (!foundContent) {
        this.loggerSvc.warn('No matching enrolled content found for one-step resume')

      }

      // If the found content is inactive(un-enrolled), we should not proceed with resume
      if(foundContent && !foundContent?.active){
        return 
      }

      const urlData = await this.contentLibSvc.getResourseLink(
        this.content,
        [foundContent],
        true,
        this.baseContentReadData,
        this.contentReadData?.identifier || '',
      )

      if (!urlData) {
        this.loggerSvc.warn('No URL data returned for one-step resume')

      }

      if (urlData?.url) {
        if (urlData.url.includes('app/toc')) {
          this.contentLibSvc.oneStepResumeEnable = false
        } else {
          this.contentLibSvc.oneStepResumeEnable = false
          // When coming from search page for particular language content, confirm first to one step resume or load the searched language
          if (urlData?.queryParams?.ML && (urlData?.queryParams?.ML !== this.queryParamsData['ML'])) {
            this.showOneStepResumeConfirm(urlData)
          } else {
            this.router.navigate(
              [urlData.url],
              { queryParams: urlData.queryParams })
          }
        }
      }

    } catch (error) {
      this.loggerSvc.error('Error in handleOneStepResume', error)
      this.contentLibSvc.oneStepResumeEnable = false
    }
  }
  private fetchContentHierarchy(identifier: string): Promise<boolean> {
    if (this.baseContentReadData?.courseCategory === 'Learning Pathway') {
      return new Promise<boolean>((resolve) => {
        const content = this.baseContentReadData


        // STEP 1: Construct hierarchy structure
        let contentHeirarchyData = this.appTocV2Svc.constructHeirarchyData(content)

        // STEP 2: Update progress with latest enrollment data
        this.appTocV2Svc.mapContentHierarchyProgressUpdate(contentHeirarchyData, this.userEnrollmentList)

        // STEP 3: Create hashmap from updated hierarchy (this should preserve completion status)
        this.tocSvc.callHirarchyProgressHashmap(contentHeirarchyData)
        this.content = contentHeirarchyData
        // Check if user is enrolled
        const isEnrolled = this.userEnrollmentList && this.userEnrollmentList.length > 0

        // STEP 4: Compute milestone locking status with enrollment status and updated progress data
        this.tocSvc.computeMilestoneLockingStatus(isEnrolled)

        // STEP 5: Sync content tree's isLocked with computed values
        this.syncMilestoneLockStatus()

        this.getOrgIdForShare()
        this.getTocStructure()
        resolve(true)
        return
      })
    } else if (this.baseContentReadData?.primaryCategory === 'Learning Resource' &&
      (this.baseContentReadData as any)?.resourceCategory !== 'Learning Resource') {
      return new Promise<boolean>((resolve) => {
        this.content = this.baseContentReadData
        this.getOrgIdForShare()
        this.getTocStructure()
        resolve(true)
      })
    } else {
      return new Promise<boolean>((resolve, reject) => {
        if (!identifier) {
          resolve(false)
          return
        }
        if (!this.isApiEnabled('hierarchy', '/apis/proxies/v8/course/v1/hierarchy')) {
          resolve(false)
          return
        }

        // Make sure fetchHierarchyContent returns an Observable
        const observable = this.contentSvc.fetchHierarchyContent(identifier, 'detail')

        if (!observable) {
          this.loggerSvc.error('fetchHierarchyContent did not return an Observable')
          resolve(false)
          return
        }

        const subscription = observable.subscribe({
          next: (response: any) => {
            if (response?.result?.content) {
              this.content = response.result.content
              this.getOrgIdForShare()
              this.getTocStructure()
              if (!this.forPreview) {
                this.userRating = undefined
                this.getUserRating(false)
              }
              resolve(true)
            } else {
              resolve(false)
            }
            subscription.unsubscribe()
          },
          error: (error: any) => {
            this.loggerSvc.error('Failed to fetch hierarchy content', error)
            reject(error)
            subscription.unsubscribe()
          }
        })
      })
    }
  }

  getTocStructure() {
    this.initializeTocStructure()
    if (this.content && this.tocStructure) {
      this.hasTocStructure = false
      this.tocStructure.learningModule = this.content.primaryCategory === this.primaryCategory.MODULE ? -1 : 0
      this.tocStructure.course = this.content.primaryCategory === this.primaryCategory.COURSE ? -1 : 0
      this.tocStructure = this.tocSvc.getTocStructure(this.content, this.tocStructure)
      for (const progType in this.tocStructure) {
        if (this.tocStructure[progType] > 0) {
          this.hasTocStructure = true
          break
        }
      }

      // from ngOnChanges
      this.fetchExternalContentAccess()
      this.modifySensibleContentRating()
      this.assignPathAndUpdateBanner(this.router.url)
      this.getLearningUrls()
    }
  }

  /**
   * Sync milestone isLocked property with computed locking status from hashmap
   * This ensures the content tree reflects the actual lock status
   */
  syncMilestoneLockStatus() {
    if (!this.content || !this.content.children) return

    let hasChanges = false
    this.content.children.forEach((child: any) => {
      if (child.primaryCategory === 'Milestone' && child.identifier) {
        const hashData = this.tocSvc.hashmap[child.identifier]
        if (hashData && hashData.computedIsLocked !== undefined) {
          const oldLocked = child.isLocked
          child.isLocked = hashData.computedIsLocked
          if (oldLocked !== child.isLocked) {
            hasChanges = true
          }
        }
      }
    })
  }

  /**
   * Refresh milestone locking status from the already-updated hashmap
   * This method should be called after progress updates to sync UI with computed lock status
   * Note: Does NOT fetch enrollment data - uses existing hashmap which is already updated
   */
  private refreshEnrollmentAndProgress() {
    if (!this.content) {
      return
    }

    try {

      // Check if user is enrolled
      const isEnrolled = this.userEnrollmentList && this.userEnrollmentList.length > 0

      // Recompute milestone locking status from existing hashmap
      // The hashmap is already updated with latest progress via hashmap update subscription
      this.tocSvc.computeMilestoneLockingStatus(isEnrolled)

      // Sync lock status from hashmap to content tree
      this.syncMilestoneLockStatus()

    } catch (error) {
      console.error('❌ Error in refreshEnrollmentAndProgress:', error)
    }
  }

  onLanguageSelect(lang: any) {
    // Check if the selected language is already set
    if (this.selectedLanguage && this.selectedLanguage.identifier === lang.identifier) {
      return // Exit the function if the language is the same
    }

    if (this.userEnrollmentList && this.userEnrollmentList.length) {
      let data = {}
      // TODO: Remove hardcode strings
      const enrolledCourse = this.tocSvc.findEnrolmentByCollectionId(this.userEnrollmentList, (this.baseContentReadData?.identifier || ''))
      if (enrolledCourse && enrolledCourse.status === 2) {
        this.processLanguageSelection(lang)
      } else {
        // If there is progress in the selected language,
        if (this.languageMapProgress && this.languageMapProgress[lang.langId] > 0) {
          data = {
            width: '500px',
            height: 'auto',
            data: {
              from: 'languageSwitch',
              icon: 'translate',
              header: `Continue where you left off in ${lang.name}?`,
              message: `You've already made some progress in this language.\n If you continue it will resume from where you left off.`,
              cancelButton: 'Back',
              acceptButton: 'Resume',
            }
          }
        } else {
          // If there is no progress in the selected language, or first time selection
          data = {
            width: '500px',
            height: 'auto',
            data: {
              from: 'languageSwitch',
              icon: 'translate',
              header: 'Are you sure you want to change the language?',
              message: 'Switching the language will reset your progress. \n The course will restart from the beginning in the selected language.',
              cancelButton: 'Back',
              acceptButton: 'Change language',
            }
          }
        }
        this.showLangSwitchPopup(lang, data)
      }
    } else {
      this.processLanguageSelection(lang)
    }
  }

  showLangSwitchPopup(lang: any, data?: any) {
    const dialogRef = this.dialog.open(TOCMultiLingualDialogComponent, data)
    dialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.processLanguageSelection(lang)
      }
    })
  }

  showOneStepResumeConfirm(urlData: any) {
    const data = {
      width: '500px',
      height: 'auto',
      data: {
        from: 'languageSwitch',
        icon: 'translate',
        header: `You've already started this course`,
        message: `You’ve made some <b>progress</b> in another language of this course. \nWould you like to <b>resume where you left off</b>, or continue with this version instead?`,
        cancelButton: 'Continue Here',
        acceptButton: 'Resume',
      }
    }
    const dialogRef = this.dialog.open(TOCMultiLingualDialogComponent, data)
    dialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.router.navigate(
          [urlData.url],
          { queryParams: urlData.queryParams })
      } else {
        const lang = this.contentLangSvc.getRequiredLanguageDetails(this.baseContentReadData, this.queryParamsData['ML'])
        this.processLanguageSelection(lang)
      }
    })
  }

  processLanguageSelection(lang: any) {
    this.selectedLanguage = lang

    // Set skeleton loader to show loading state
    this.skeletonLoader = true
    // Check if language object has required properties
    if (lang && lang.identifier) {
      // Create a promise chain to fetch content data and hierarchy sequentially
      this.fetchContentRead(lang.identifier)
        .then(() => {
          // After content read is successful, fetch the hierarchy
          return this.fetchContentHierarchy(lang.identifier)
        })
        .then(() => {
          // Both operations were successful
          // Update UI as needed with new content
          this.routerChangeHandler(true)
          if (this.userEnrollmentList && this.userEnrollmentList.length) {
            this.generateResumeDataLinkNew()
          }
          if (this.content) {
            this.getLearningUrls()
            // Reset user progress and fetch enrollment data if not in preview mode
            if (!this.forPreview) {
              this.checkIfUserEnrolled()
            }
          }
          // Update subject to notify rating summry component and load the sumamry of selected language
          this.resetRatingsService.setRatingServiceUpdate(true)
          // Finally set loading state to false
          this.skeletonLoader = false
        })
        .catch((error) => {
          // Handle any errors in the promise chain
          this.loggerSvc.error('Error during language change:', error)
          this.skeletonLoader = false
          this.snackBar.open('Failed to load content in selected language', 'X', {
            duration: 3000,
          })
        })
    } else {
      this.loggerSvc.error('Invalid language selection', lang)
      this.skeletonLoader = false
      this.snackBar.open('Invalid language selection', 'X', {
        duration: 3000,
      })
    }
  }

  /**
   * Fetches content data for a given identifier and updates the contentReadData property
   * @param identifier The content identifier to fetch
   * @returns Promise that resolves to true if content was fetched successfully, false otherwise
   */
  private async fetchContentRead(identifier: string): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      if (!identifier) {
        this.loggerSvc.error('Cannot fetch content: identifier is missing')
        resolve(false)
        return
      }
      if (!this.isApiEnabled('extendedContentRead', '/apis/proxies/v8/extended/content/v1/read')) {
        resolve(false)
        return
      }

      const observable = this.contentSvc.fetchContentData(identifier)

      if (!observable) {
        this.loggerSvc.error('fetchContentData did not return an Observable')
        resolve(false)
        return
      }

      const subscription = observable.subscribe({
        next: (response: any) => {
          if (response?.result?.content) {
            // Update contentReadData with the fetched content
            this.contentReadData = response.result.content

            // Update language list after content is fetched
            if (this.contentReadData) {
              this.languageList = this.contentLangSvc.getAllContentLanguages(this.contentReadData)
              this.selectedLanguage = this.contentLangSvc.getSelectedLanguage(this.contentReadData)
            }

            resolve(true)
          } else {
            this.loggerSvc.warn('Content data not found in response', response)
            resolve(false)
          }
          subscription.unsubscribe()
        },
        error: (error: any) => {
          this.loggerSvc.error('Failed to fetch content data', error)
          reject(error)
          subscription.unsubscribe()
        }
      })
    })
  }

  routerChangeHandler(appendBatchId: boolean) {
    const queryParams: any = {}

    // Add batch ID if needed
    if (appendBatchId && this.getBatchId()) {
      queryParams.batchId = this.getBatchId()
    }

    // Add multilingual ID and language to query params if available
    if (this.contentReadData && this.contentReadData.identifier) {
      let language = ''

      // Handle both string and array language formats
      if (Array.isArray(this.contentReadData.language)) {
        language = this.contentReadData.language[0].toLowerCase()
      } else if (this.contentReadData.language) {
        language = this.contentReadData.language.toLowerCase()
      }
      if (!(this.selectedLanguage && Object.keys(this.selectedLanguage).length)) {
        this.selectedLanguage = {
          langId: language,
          name: this.contentReadData.language[0]
        }
      }
      // Only add parameters if we have valid data
      if (language) {
        queryParams.ML = language
      }

      queryParams.MLId = this.contentReadData.identifier
    }

    // Only navigate if we have batch ID or other parameters
    if (Object.keys(queryParams).length > 0) {
      this.router.navigate(
        [],
        {
          relativeTo: this.route,
          queryParams: queryParams,
          queryParamsHandling: 'merge',
        }
      )
    }
  }

  private getContinueLearningData(contentId: string, batchId?: string, lang?: string) {
    this.tocSvc.contentLoader.next(true)
    this.resumeData = null
    let userId
    if (this.configSvc.userProfile) {
      userId = this.configSvc.userProfile.userId || ''
    }

    const req: NsContent.IContinueLearningDataReq = {
      request: {
        batchId,
        userId,
        courseId: contentId || '',
        contentIds: [],
        fields: ['progressdetails'],
        ...(lang ? { language: lang } : null),
      },
    }
    if (!this.content) {
      // Hierarchy content failed to load (e.g. hierarchy API error) - nothing to continue learning from
      this.loggerSvc.error('Cannot fetch continue learning data: content is missing')
      this.tocSvc.contentLoader.next(false)
      this.skeletonLoader = false
      this.enrollBtnLoading = false
      this.snackBar.open('Unable to load the content. Please try again.', 'X', {
        duration: 6000,
      });
      return
    }
    if (this.content.primaryCategory !== NsContent.EPrimaryCategory.RESOURCE && this.isApiEnabled('contentProgress', '/apis/proxies/v8/read/content-progres')) {
      this.contentSvc.fetchContentHistoryV2(req).subscribe(
        data => {
          this.enrollBtnLoading = false
          if (data && data.result && data.result.contentList && data.result.contentList.length) {
            const tempResumeData = _.get(data, 'result.contentList')
            this.languageMapProgress = _.get(data, 'result.languageProgress') || {}
            this.resumeData = _.map(tempResumeData, rr => {
              // tslint:disable-next-line
              const items = _.filter(flattenItems(_.get(this.content, 'children') || [], 'children'), { 'identifier': rr.contentId, primaryCategory: 'Learning Resource' })
              _.set(rr, 'progressdetails.mimeType', _.get(_.first(items), 'mimeType'))
              if (!_.get(rr, 'completionPercentage')) {
                if (_.get(rr, 'status') === 2) {
                  _.set(rr, 'completionPercentage', 100)
                } else {
                  _.set(rr, 'completionPercentage', 0)
                }
              }
              return rr
            })
            const progress = _.map(this.resumeData, 'completionPercentage')
            const totalCount = _.toInteger(_.get(this.content, 'leafNodesCount')) || 1
            if (progress.length < totalCount) {
              const diff = totalCount - progress.length
              if (diff) {
                // tslint:disable-next-line
                _.each(new Array(diff), () => {
                  progress.push(0)
                })
              }
            }
            this.generateResumeDataLinkNew()
            this.tocSvc.updateResumaData(this.resumeData)
            // this.tocSvc.mapModuleDurationAndProgress(this.content, this.content)
            this.getLastPlayedResource()
            if (this.content?.completionPercentage !== 100) {
              this.tocSvc.mapCompletionPercentage(this.content, this.resumeData)
            }
            this.tocSvc.callHirarchyProgressHashmap(this.content)
            // Recompute milestone locking status after progress update
            if (this.baseContentReadData?.courseCategory === 'Learning Pathway') {
              const isEnrolled = this.userEnrollmentList && this.userEnrollmentList.length > 0
              this.tocSvc.computeMilestoneLockingStatus(isEnrolled)
              this.syncMilestoneLockStatus()
            }
            this.tocSvc.contentLoader.next(false)
          } else {
            this.resumeData = null
            this.tocSvc.callHirarchyProgressHashmap(this.content)
            // Recompute milestone locking status even with no progress data
            if (this.baseContentReadData?.courseCategory === 'Learning Pathway') {
              const isEnrolled = this.userEnrollmentList && this.userEnrollmentList.length > 0
              this.tocSvc.computeMilestoneLockingStatus(isEnrolled)
              this.syncMilestoneLockStatus()
            }
            this.tocSvc.contentLoader.next(false)
          }

          this.contentSvc.setProgramChildResumeData(this.resumeData, contentId)
          if (this.content?.completionPercentage !== 100) {
            this.bindCompletionPercentage()
          }
        },
        (error: any) => {
          this.loggerSvc.error('CONTENT HISTORY FETCH ERROR >', error)
          this.tocSvc.contentLoader.next(false)
          this.skeletonLoader = false
          this.enrollBtnLoading = false
        },
      )
    } else {
      this.tocSvc.contentLoader.next(false)
      this.skeletonLoader = false
      this.enrollBtnLoading = false
    }
  }

  generateResumeDataLinkNew() {
    if (this.resumeData && this.content) {
      let resumeDataV2: any
      if (this.content.completionPercentage === 100) {
        resumeDataV2 = this.getResumeDataFromList('start')
      } else {
        resumeDataV2 = this.getResumeDataFromList()
      }
      if (!resumeDataV2.mimeType) {
        resumeDataV2.mimeType = this.tocSvc.getMimeType(this.content, resumeDataV2.identifier)
      }
      this.resumeDataLink = this.getResumeUrl(resumeDataV2)
      this.actionSVC.setUpdateCompGroupO = this.resumeDataLink
      /* tslint:disable-next-line */
    }
  }
  isSelectedInMoreDropdown(): boolean {
    if (!this.selectedLanguage?.identifier || !this.languageList) {
      return false
    }
    return this.languageList.slice(5).some((lang: any) =>
      lang?.identifier === this.selectedLanguage?.identifier
    )
  }

  async getQueryParams() {
    const tempQueryParamsData: any = {}
    this.routeSubscription = this.route.queryParamMap.subscribe(async qParamsMap => {

      // Extract all parameters from the ParamMap
      qParamsMap.keys.forEach(key => {
        tempQueryParamsData[key] = qParamsMap.get(key) ?? ''
      })
      tempQueryParamsData

      // Process specific parameters
      const contextId = tempQueryParamsData['contextId']
      const contextPath = tempQueryParamsData['contextPath']
      const recommendedCoursesId = tempQueryParamsData['recommendationId']

      if (contextId && contextPath) {
        this.contextId = contextId
        this.contextPath = contextPath
      }

      if (recommendedCoursesId) {
        this.recommendedCoursesId = recommendedCoursesId
        try {
          const response = await this.userServiceLib.getRecommendedCoursesSakshamAI(recommendedCoursesId).toPromise()
          if (response && response.feedbacks && response.feedbacks.length) {
            this.feedbackGiven = response.feedbacks.find((feedback: any) => feedback?.course_id === this.courseID)
          }
        } catch (error) {
          this.loggerSvc.error('Error fetching recommended courses:', error)
        }
      }
    })
    return tempQueryParamsData
  }

  getOrgIdForShare() {
    if (this.content && ![
      NsContent.ECourseCategory.MODERATED_COURSE,
      NsContent.ECourseCategory.MODERATED_ASSESSEMENT,
      NsContent.ECourseCategory.MODERATED_PROGRAM,
      NsContent.ECourseCategory.INVITE_ONLY_PROGRAM,
    ].includes(this.content.courseCategory)) {
      this.canShare = true
      if (this.configSvc.userProfile) {
        this.rootOrgId = this.configSvc.userProfile.rootOrgId
      }
    }
  }

  /**
   * Fetches and processes content creator data from the current content
   * - Sets contentCreatorData from parsed creator contacts
   * - Determines if "show button" flag should be enabled based on content name
   * - Includes proper error handling for null values and parsing
   */
  getContentCreatorData() {
    try {
      // Only proceed if we have valid content data
      if (!this.contentReadData) {
        this.loggerSvc.warn('Cannot get creator data: contentReadData is not available')
        return
      }

      // Process content name for comparison (safely handle null/undefined)
      const contentName = this.contentReadData.name?.trim() || ''

      // Parse and set creator contacts if available
      if (this.contentReadData.creatorContacts) {
        // Use the existing parsing method to handle creator contacts
        this.contentCreatorData = this.handleParseJsonData(this.contentReadData.creatorContacts)
      } else {
        // Reset to empty array if no creator contacts
        this.contentCreatorData = []
      }

      // Set showBtn flag based on dakshta name comparison (case insensitive)
      // This determines if the special button for dakshta content is shown
      this.showBtn = contentName.toLowerCase() === this.dakshtaName.toLowerCase()
    } catch (error) {
      // Handle any unexpected errors
      this.loggerSvc.error('Error processing content creator data:', error)
      this.contentCreatorData = []
      this.showBtn = false
    }
  }

  getI18NTranslations() {
    // Subscribe to language translation flag changes
    const translationSubscription = this.configSvc.languageTranslationFlag
      .pipe(takeUntil(this.destroySubject$)) // Ensure subscription is cleaned up on component destroy
      .subscribe({
        next: (data: any) => {
          // Only proceed if we have valid data
          if (data) {
            // Check if website language is set in localStorage
            const storedLanguage = localStorage.getItem('websiteLanguage')
            if (storedLanguage) {
              // Set default language as fallback
              this.translate.setDefaultLang('en')

              // Use the stored language preference
              this.translate.use(storedLanguage)
            }
          }
        },
        error: (error) => {
          // Log any errors that occur during subscription
          this.loggerSvc.error('Error in language translation subscription:', error)
        }
      })

    // Store subscription for cleanup (optional alternative to takeUntil)
    this.translationSubscription = translationSubscription
  }

  getServerDateTime() {
    if (!this.isApiEnabled('getServerDate', '/apis/public/v8/systemDate')) {
      const clientTime = new Date().getTime()
      this.tocSvc.changeServerDate(clientTime)
      this.serverDate = clientTime
      return
    }
    // Fetch the server date time and process the response
    this.tocSvc.getServerDate().subscribe(
      (response: any) => {
        // Check if response contains valid system date
        if (response && response.systemDate) {
          // Update service with server date (removed duplicate call)
          this.tocSvc.changeServerDate(response.systemDate)
          this.serverDate = response.systemDate
        } else {
          // Fallback to client's time if server time is not available
          const clientTime = new Date().getTime()
          this.tocSvc.changeServerDate(clientTime)
          this.serverDate = clientTime
        }

        // Initialize dependent functions that need server date
        this.findACPB()
        this.getKarmapointsLimit()
      },
      (error: any) => {
        // Log the error for debugging
        this.loggerSvc.error('Failed to get server date:', error)

        // Fallback to client's time on error
        const clientTime = new Date().getTime()
        this.tocSvc.changeServerDate(clientTime)
        this.serverDate = clientTime
      }
    )

    // Subscribe to server date changes from service
    this.serverDateSubscription = this.tocSvc.serverDate
      .pipe(takeUntil(this.destroySubject$)) // Ensure subscription is cleaned up
      .subscribe(serverDate => {
        this.serverDate = serverDate
      })
  }

  get getBaseContentIdentifier() {
    return this.baseContentReadData?.identifier || this.content?.identifier || ''
  }

  get isMultilingual() {
    if (this.baseContentReadData && this.baseContentReadData.languageMapV1) {
      return this.languageList.length > 1
    }
    return false
  }

  handleEnrollment(event: any) {

    if (this.isMultilingual) {
      this.openLangDialog(event)
    } else {
      this.handleAutoBatchAssign()
    }
  }

  handleReEnrollment(event: any) {
      this.enrollBtnLoading = true
      this.changeTab = !this.changeTab
      this.raiseEnrollmentTelemetry('reenroll')
      console.log('this.enrolledCourseData', this.enrolledCourseData)
      // API logic and redirection
      if (this.enrolledCourseData) {
        const req = {
            "request": {
                "courseId": this.enrolledCourseData.courseId,
                "batchId": this.enrolledCourseData.batchId,
                "recent_language": this.enrolledCourseData.recent_language || this.selectedLanguage?.langId || '',
            }
        }
      this.contentSvc.reEnroll(req).subscribe(
        (res: any) => {
          if(res === 'SUCCESS') {
            const batchId = this.getBatchId()
            if (batchId) {
              this.navigateToPlayerPage(batchId)
            }
            this.isUnEnrolled = false
            this.enrollBtnLoading = false
          } else {
            this.snackBar.open('Please try again later')
            this.enrollBtnLoading = false
          }
        },
        (_error: any) => {
          this.snackBar.open(_.get(_error, 'error.params.errmsg') || 'Please try again later')
          this.enrollBtnLoading = false
        }
      )
    }
  }

  openLangDialog(_event: any) {
    const dialogRef = this.dialog.open(EnrollLanguageDialogueComponent, {
      width: '500px',
      height: 'auto',
      autoFocus: false,
      restoreFocus: false,
      data: {
        preSelect: this.selectedLanguage,
        languageList: this.languageList,
      }
    })
    dialogRef.afterClosed().subscribe((selectedLang) => {
      if (selectedLang) {
        this.selectedLanguage = selectedLang
        this.handleAutoBatchAssign()
      }
    })
  }

  getResumeUrl(resourceData: any, batchId?: any, primaryCategory?: any) {
    let MLId = this.selectedLanguage?.identifier || ''
    let ML = this.selectedLanguage?.langId || ''
    let resumeDataUrl = viewerRouteGenerator(
      resourceData.identifier,
      resourceData.mimeType,
      this.isResource ? undefined : this.baseContentReadData && this.baseContentReadData?.identifier || '',
      this.isResource ? undefined : this.baseContentReadData && this.baseContentReadData?.contentType || '',
      this.forPreview,
      primaryCategory || 'Learning Resource',
      batchId || this.getBatchId(),
      this.baseContentReadData && this.baseContentReadData?.name || '',
      ML,
      MLId,
    )
    return resumeDataUrl
  }

  get contentCompletionPercent() {
    if (this.batchData?.enrolled) {
      if (this.contentReadData && this.contentReadData.primaryCategory === 'Course' && this.isMultilingual) {
        if (this.languageMapProgress && this.selectedLanguage?.langId && this.languageMapProgress[this.selectedLanguage?.langId]) {
          return this.languageMapProgress[this.selectedLanguage?.langId]
        } else {
          return 0
        }
      } else {
        return this.content?.completionPercentage || 0
      }
    }
  }

  checkForCompletionSurveyTrigger() {
    if (this.content && this.contentReadData) {
      // check if completion survey is enabled and user has completed the course before 23rd DEC 2023 (release date of completion survey)
      if (this.configSvc.instanceConfig && this.configSvc.instanceConfig.completionSurvey && this.configSvc.instanceConfig.completionSurvey.enabled &&
        this.enrolledCourseData && this.enrolledCourseData && this.enrolledCourseData.completedOn >= this.configSvc.instanceConfig.completionSurvey.startDate) {
        if ((this.content.completionStatus === 2 || this.content.completionPercentage === 100) && this.contentReadData.completionSurveyLink) {
          const sID = this.contentReadData.completionSurveyLink.split('surveys/')
          const surveyId = sID[1]
          const courseId = this.contentReadData.identifier
          // Call API to see if survey is submitted or not
          this.tocSvc.getApllicationsById(surveyId, courseId).subscribe((res) => {
            if (res.result.response && Object.keys(res.result.response).length > 0) {
              this.lockCertificate = false
            } else {
              this.lockCertificate = true
              this.openCompletionSurveyFormPopup()
            }
          })
        }
      }
    }
  }

  // Clear existing survey data from local storage before opening popup
  clearExistingPublicSurveyData(surveyId: string, courseId: string) {
    const storageKey = `survey_${surveyId}_${courseId}`
    if (localStorage.getItem(storageKey)) {
      localStorage.removeItem(storageKey)
    }
  }

  openPublicSurveyPopup(navigationUrl?: string, queryParams?: any) {
    // Get survey ID and course ID from environment and content data

    const surveyId = this.environment.publicContentSurveyId || ''
    const courseId = this.contentReadData?.identifier || ''
    const courseName = this.contentReadData?.name || ''
    const contextOrgId = this.contentReadData?.createdFor && this.contentReadData?.createdFor.length > 0 ?
      this.contentReadData?.createdFor[0] : ''

    this.clearExistingPublicSurveyData(surveyId, courseId)

    const data = {
      surveyId: surveyId,
      courseId: courseId,
      courseName: courseName,
      contextOrgId: contextOrgId,
      forPreview: this.forPreview
    }

    const dialogRef = this.dialog.open(PublicSurveyFormComponent, {
      // disableClose: true,
      width: '750px',
      maxWidth: '90vw',
      height: '80vh',
      data: data,
      autoFocus: false,
    })
    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        if (window.location.href.includes('/public/')) {
          delete queryParams.editMode
        }
        // Navigate to the intended URL only when survey is submitted successfully
        if (navigationUrl) {
          this.router.navigate([navigationUrl], { queryParams: queryParams })
        }
      }
    })


  }

  resumeContentData() {
    const navigationUrl = (this.resumeData && !this.certData) ? this.resumeDataLink?.url : this.firstResourceLink?.url
    const queryParams = (this.resumeData && !this.certData) ? this.generateQuery('RESUME') : this.generateQuery('START')
    this.router.navigate([navigationUrl], { queryParams: queryParams })
  }

  /**
   * Check if user can enroll in the course
   * Returns true when enrollment is allowed
   */


  navigateToNewVersion() {
    this.router.navigateByUrl('/app/toc', { skipLocationChange: true }).then(() => {
      this.router.navigate([`app/toc/${this.contentReadData?.contentVersionInfo?.identifier}/overview`])
    })

  }

  canEnroll() {
    if (this.contentReadData && this.contentReadData.lastEnrollmentDate) {
      const serverTime = dayjs(this.serverDate).format('YYYY-MM-DD')
      const eDate = dayjs(this.contentReadData.lastEnrollmentDate).format('YYYY-MM-DD')
      if (dayjs(serverTime).isSameOrBefore(eDate)) {
        return true
      } else {
        return false
      }
    } else {
      return true
    }
  }

  goBack() {
    this.location.back()
  }

  showBadgeIcon(): boolean {
    const badgeDetails = this.baseContentReadData?.badgeDetails_v1
    if (!badgeDetails || !badgeDetails.length) {
      return false
    }
    const badge = badgeDetails[0]
    // If badgeEarningDateEnabled is false, don't show badge
    if (!badge?.badgeEarningDateEnabled) {
      return true
    }
    // If badgeEarningDateEnabled is true, show badge only if badgeEarningDateTime has passed
    if (badge?.badgeEarningDateEnabled && badge?.badgeEarningDateTime) {
      return badge.badgeEarningDateTime > Date.now()
    }
    return false
  }

  /**
   * Builds the hover text shown on the banner badge icon.
   * For a Learning Pathway it tells the learner how many mandatory courses earn the badge.
   */
  updateBadgeTooltipText(): void {
    this.badgeTooltipText = ''
    if (this.baseContentReadData?.courseCategory !== 'Learning Pathway') {
      return
    }
    const mandatoryCourseCount = this.getPathwayMandatoryCourseCount()
    if (!mandatoryCourseCount) {
      return
    }
    this.badgeTooltipText =
      `Earn a badge on completing ${mandatoryCourseCount} mandatory courses in this Learning Pathway`
  }

  /**
   * Counts the mandatory courses across all milestones of a Learning Pathway
   */
  getPathwayMandatoryCourseCount(): number {
    const baseData = this.baseContentReadData as any
    let milestones: any[] = []
    if (baseData?.milestones_v1?.length) {
      milestones = baseData.milestones_v1
    } else if ((this.content as any)?.children?.length) {
      milestones = (this.content as any).children.filter((child: any) =>
        child?.primaryCategory === 'Milestone' || child?.courseCategory === 'Milestone')
    }
    return milestones.reduce((count: number, milestone: any) => {
      const courses = milestone?.courses || milestone?.children || []
      const mandatoryCourses = courses.filter((course: any) =>
        course?.primaryCategory === 'Course' && (course?.isMandatory === true || course?.mandatory === true))
      return count + mandatoryCourses.length
    }, 0)
  }

  async areAllActiveBatchesFull(): Promise<void> {
    if (!this.baseContentReadData?.batches || this.baseContentReadData?.batches.length === 0) {
      return
    }
    this.activeBatchIds = []
    this.fullBatcheIds = []
    let activeBatches = []
    activeBatches = this.baseContentReadData.batches.filter((batch: any) => this.getActiveBatches(batch))
    this.activeBatchIds = activeBatches.map((batch: any) => batch.batchId)
    if (this.activeBatchIds.length === 0) {
      return
    }
    await Promise.all(
      activeBatches.map(async (batch: any) => {
        const currentBatchSize = Number(_.get(batch, 'batchAttributes.currentBatchSize', 0))
        const totalApprovedCount = await this.getBatchUserCount(batch)
        if (currentBatchSize === totalApprovedCount) {
          this.fullBatcheIds.push(batch.batchId)
        }
      })
    )
    this.allBatchesAreFull = this.fullBatcheIds.length === this.activeBatchIds.length
    this.cdr.detectChanges()
  }

  async getBatchUserCount(batch: any): Promise<number> {
    const req = {
      serviceName: 'blendedprogram',
      applicationStatus: '',
      applicationIds: [
        batch.batchId,
      ],
      limit: 100,
      offset: 0,
    }
    try {
      const res: any = await this.contentSvc.fetchBlendedUserCOUNT(req)
      if (res && res.result && res.result.data) {
        const approvedEntry = res.result.data.find((ele: any) => ele.currentStatus === 'APPROVED')
        return approvedEntry ? Number(approvedEntry.statusCount) : 0
      }
      return 0
    } catch (err: any) {
      console.error('Error fetching batch user count', err)
      return 0
    }
  }
}
