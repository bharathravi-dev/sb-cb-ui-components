import { Component, OnInit, Input, HostBinding, Output, EventEmitter, OnChanges } from '@angular/core'
import { NsWidgetResolver, WidgetBaseComponent } from '@sunbird-cb/resolver-v2'
import { IAuthorData } from './author-card.model'

@Component({
  selector: 'ws-widget-author-card',
  templateUrl: './author-card.component.html',
  styleUrls: ['./author-card.component.scss'],
  // /* tslint:disable */
  // // host: { class: '' }
  // /* tslint:enable */
  standalone: false,
})
export class AuthorCardComponent extends WidgetBaseComponent
  implements OnInit, OnChanges, NsWidgetResolver.IWidgetData<IAuthorData> {
  @Input() widgetData!: IAuthorData
  @Input() actions: any
  @Input() type?: any
  @Input() contentData?: any
  @Input() approvalType?: any
  @Output() clicked?: EventEmitter<any> = new EventEmitter<any>()
  @Output() userClick = new EventEmitter()
  @Output() selectedUsers = new EventEmitter()
  @Input() remove: any
  @Input() showProfile: any = false
  @Input() bulkSelection?: any = false
  @Input() selectedAllUsersFlag?: any = false
  selectedUsersArr: any = []
  @HostBinding('id')
  public id = `auth-card-${Math.random()}`
  @HostBinding('class')
  public class = 'flex flex-1 mb-4'
  isViewReport = false
  viewReportData = {
    userId: '',
    formId: '',
  }

  constructor() {
    super()
  }

  get isUnenrolledLearner(): boolean {
    return Boolean(this.showProfile && this.widgetData && this.widgetData?.active === false)
  }

  ngOnInit() {
    this.selectedUsersArr = []
    this.checkForSurveyLink()
  }

  ngOnChanges(): void {
    if (this.bulkSelection && this.selectedAllUsersFlag) {
      this.selectAllUsers()
    }
  }
  getProfileLink() {
    if (this.widgetData && this.widgetData.profileLink) {
      return `/app/profile/${this.widgetData.profileLink}`
    }
    return null
  }
  viewDetail() {
    if (this.clicked) {
      this.clicked.emit(this.widgetData)
    }
  }

  clickApprove() {
    if (this.isUnenrolledLearner) {
      return
    }
    const data = {
      action: 'Approve',
      userData: this.widgetData,
    }
    this.userClick.emit(data)
  }

  clickReject() {
    if (this.isUnenrolledLearner) {
      return
    }
    const data = {
      action: 'Reject',
      userData: this.widgetData,
    }
    this.userClick.emit(data)
  }

  clickRemove() {
    if (this.isUnenrolledLearner) {
      return
    }
    const data = {
      action: 'Remove',
      userData: this.widgetData,
    }
    this.userClick.emit(data)
  }

  checkForSurveyLink() {
    if (this.type === 'newRequest' && this.contentData && this.contentData['wfSurveyLink']) {
      this.isViewReport = true
      const sID = this.contentData.wfSurveyLink.split('surveys/')
      this.viewReportData.formId = sID[1]
      this.viewReportData.userId = (this.widgetData
        && this.widgetData.userInfo && this.widgetData.userInfo.wid) ? this.widgetData.userInfo.wid : ''
    }
  }

  // openReportDialog() {
  //   const dialogRef = this.dialogue.open(ViewReportDialogComponent, {
  //     data: this.viewReportData,
  //     autoFocus: false,
  //     width: '920px',
  //   })
  //   dialogRef.afterClosed().subscribe(() => { })
  // }

  selectNewRequest(event: any, widgetData: any) {
    if (this.isUnenrolledLearner) {
      return
    }
    if (event && event.checked) {
      this.selectedUsers.emit({ checked: true, widgetData })
    } else {
      this.selectedUsers.emit({ checked: false, widgetData })
    }
  }

  selectAllUsers() {

  }
}