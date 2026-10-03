import { TestBed } from '@angular/core/testing'
import { of } from 'rxjs'

import { BATCH_LIST_LIMIT, WidgetContentService } from './widget-content.service'

describe('WidgetContentService', () => {
  beforeEach(() => TestBed.configureTestingModule({}))

  it('should be created', () => {
    const service: WidgetContentService = TestBed.inject(WidgetContentService)
    expect(service).toBeTruthy()
  })

  /**
   * Built off the prototype rather than through TestBed, so the batch list calls are exercised
   * without standing up the service's full dependency graph.
   */
  describe('batch list', () => {
    const COURSE_ID = 'do_1146698403652239361153'

    function createService(): any {
      const service: any = Object.create(WidgetContentService.prototype)
      service.http = { post: jest.fn() }
      return service
    }

    it('builds the first page request by default', () => {
      const service = createService()

      expect(service.getCourseBatchesRequest(COURSE_ID)).toEqual({
        request: {
          filters: { courseId: COURSE_ID },
          sort_by: { createdDate: 'desc' },
          offset: 0,
          limit: BATCH_LIST_LIMIT,
        },
      })
    })

    it('builds a request for the given offset and limit', () => {
      const service = createService()

      const req = service.getCourseBatchesRequest(COURSE_ID, 20, 5)

      expect(req.request.offset).toBe(20)
      expect(req.request.limit).toBe(5)
    })

    it('posts to the paginated batch list and returns the response', done => {
      const service = createService()
      const response = { count: 76, content: [{ batchId: 'batch_0' }] }
      service.http.post.mockReturnValue(of({ result: { response } }))
      const req = service.getCourseBatchesRequest(COURSE_ID, 10)

      service.fetchCourseBatches(req).subscribe((data: any) => {
        expect(service.http.post).toHaveBeenCalledWith('/apis/proxies/v8/learner/course/v1/learner/batch/list', req)
        expect(data).toEqual(response)
        done()
      })
    })
  })
})
