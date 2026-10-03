jest.mock('@sunbird-cb/utils-v2', () => ({
  EventService: jest.fn(),
  ConfigurationsService: jest.fn(),
  WsEvents: {},
}))
jest.mock('@sunbird-cb/consumption', () => ({ ContentLanguageService: jest.fn() }))
jest.mock('@angular/material/dialog', () => ({ MatDialog: jest.fn() }))
jest.mock('@angular/material/snack-bar', () => ({ MatSnackBar: jest.fn() }))
jest.mock('../../certificate-dialog/certificate-dialog.component', () => ({ CertificateDialogComponent: jest.fn() }))
jest.mock('../../../../services/certificate.service', () => ({ CertificateService: jest.fn() }))
jest.mock('../../../../services/app-toc.service', () => ({ AppTocService: jest.fn() }))
jest.mock('../../../../services/resource-download-helper.service', () => ({ ResourceDownloadHelperService: jest.fn() }))

import { AppTocContentCardV2Component } from './app-toc-content-card-v2.component'
import { NsContent } from '../../../../_services/widget-content.model'

describe('AppTocContentCardV2Component', () => {
  let component: AppTocContentCardV2Component

  beforeEach(() => {
    const dep = {} as any
    component = new AppTocContentCardV2Component(dep, dep, dep, dep, dep, dep, dep, dep, dep, dep)
  })

  it('should create', () => {
    expect(component).toBeTruthy()
  })

  describe('updateChildParentMap', () => {
    const offlineSession = (completionPercentage: number, completionStatus: number) => ({
      primaryCategory: NsContent.EPrimaryCategory.OFFLINE_SESSION,
      leafNodes: [],
      leafNodesCount: null,
      completionPercentage,
      completionStatus,
    })

    it('keeps a completed offline session completed', () => {
      component.hierarchyMapData = { session: offlineSession(100, 2) }

      component.updateChildParentMap('session')

      expect(component.hierarchyMapData.session.completionPercentage).toBe(100)
      expect(component.hierarchyMapData.session.completionStatus).toBe(2)
    })

    it('keeps an offline session that is not attended yet unchanged', () => {
      component.hierarchyMapData = { session: offlineSession(0, 0) }

      component.updateChildParentMap('session')

      expect(component.hierarchyMapData.session.completionPercentage).toBe(0)
      expect(component.hierarchyMapData.session.completionStatus).toBe(0)
    })

    it('counts completed offline sessions in the module progress', () => {
      component.hierarchyMapData = {
        module: {
          primaryCategory: NsContent.EPrimaryCategory.MODULE,
          leafNodes: ['video', 'sessionOne', 'sessionTwo'],
          leafNodesCount: 3,
          completionPercentage: 0,
          completionStatus: 0,
        },
        video: {
          primaryCategory: NsContent.EPrimaryCategory.RESOURCE,
          completionPercentage: 100,
          completionStatus: 2,
        },
        sessionOne: offlineSession(100, 2),
        sessionTwo: offlineSession(100, 2),
      }

      component.updateChildParentMap('sessionOne')
      component.updateChildParentMap('sessionTwo')
      component.updateChildParentMap('module')

      expect(component.hierarchyMapData.module.completionPercentage).toBe(100)
      expect(component.hierarchyMapData.module.completionStatus).toBe(2)
    })
  })
})
