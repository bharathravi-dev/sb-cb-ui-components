import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { of } from 'rxjs';

import { InviteUsersComponent } from './invite-users.component';
import { NsAccessControlConfig } from '../../../_models/access-control.model';
import { ALL_ORGANISATIONS_SELECTION, MINISTRY_OR_STATE_FILTER_KEY } from '../../../_constants/app.constants';

describe('InviteUsersComponent', () => {
  let component: InviteUsersComponent;
  let accessControlService: any;
  let config: any;

  const CENTRAL_DEPUTATION_KEY = 'profileDetails.cadreDetails.isOnCentralDeputation';

  const createComponent = (dialogData: any = {}) => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: MAT_DIALOG_DATA, useValue: dialogData }]
    });
    return TestBed.runInInjectionContext(
      () => new InviteUsersComponent({ close: jest.fn() } as any, accessControlService, {} as any)
    );
  };

  const searchWithConditions = (conditions: any[]) => {
    component = createComponent({ rule: { conditions } });
    component.isCCA = config.userConfig.org.isCCA;
    component.search();
    return accessControlService.fetchUserList.mock.calls[0][3];
  };

  beforeEach(() => {
    config = {
      application: NsAccessControlConfig.Application.MDO,
      userConfig: { org: { isCCA: false, rootOrgId: 'own-org' } },
      usersTableConfig: {}
    };
    accessControlService = {
      accessControlConfig: jest.fn(() => config),
      fetchUserList: jest.fn(() => of({ result: { response: { content: [], count: 0 } } })),
      getOrgHierarchyOrgIds: jest.fn(() => []),
      isL0MdoUser: jest.fn(() => false),
      getLoggedInOrgId: jest.fn(() => 'own-org'),
      areAllOrgHierarchyOrgsSelected: jest.fn(() => false)
    };
    component = createComponent();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('search - central deputation', () => {
    it('should send a boolean selection as the cadre central deputation filter', () => {
      const filters = searchWithConditions([
        { entity: NsAccessControlConfig.SelectionType.CentralDeputation, selections: [true] }
      ]);

      expect(filters[CENTRAL_DEPUTATION_KEY]).toBe(true);
      expect(filters.orgCustomFields).toBeUndefined();
    });

    it('should send false when false is selected', () => {
      const filters = searchWithConditions([
        { entity: NsAccessControlConfig.SelectionType.CentralDeputation, selections: [false] }
      ]);

      expect(filters[CENTRAL_DEPUTATION_KEY]).toBe(false);
    });

    it('should convert a "true" string selection from an edited rule to a boolean', () => {
      const filters = searchWithConditions([
        { entity: NsAccessControlConfig.SelectionType.CentralDeputation, selections: ['true'] }
      ]);

      expect(filters[CENTRAL_DEPUTATION_KEY]).toBe(true);
      expect(filters.orgCustomFields).toBeUndefined();
    });

    it('should convert a "false" string selection from an edited rule to a boolean', () => {
      const filters = searchWithConditions([
        { entity: NsAccessControlConfig.SelectionType.CentralDeputation, selections: ['false'] }
      ]);

      expect(filters[CENTRAL_DEPUTATION_KEY]).toBe(false);
    });

    it('should accept a selection that is not wrapped in an array', () => {
      const filters = searchWithConditions([
        { entity: NsAccessControlConfig.SelectionType.CentralDeputation, selections: 'true' }
      ]);

      expect(filters[CENTRAL_DEPUTATION_KEY]).toBe(true);
    });

    it('should not send the filter for an unrecognised value', () => {
      const filters = searchWithConditions([
        { entity: NsAccessControlConfig.SelectionType.CentralDeputation, selections: ['yes'] }
      ]);

      expect(filters).not.toHaveProperty(CENTRAL_DEPUTATION_KEY);
      expect(filters.orgCustomFields).toBeUndefined();
    });

    it('should not send the filter when central deputation is not part of the rule', () => {
      const filters = searchWithConditions([
        { entity: NsAccessControlConfig.SelectionType.Service, selections: ['indian administrative service (ias)'] }
      ]);

      expect(filters).not.toHaveProperty(CENTRAL_DEPUTATION_KEY);
      expect(filters['profileDetails.cadreDetails.civilServiceName']).toEqual(['indian administrative service (ias)']);
    });
  });

  describe('search - org custom fields', () => {
    it('should not add orgCustomFields for a condition without an entity', () => {
      const filters = searchWithConditions([
        { entity: NsAccessControlConfig.SelectionType.CentralDeputation, selections: [true] },
        { entity: '', selections: [] }
      ]);

      expect(filters.orgCustomFields).toBeUndefined();
      expect(filters[CENTRAL_DEPUTATION_KEY]).toBe(true);
    });

    it('should not add orgCustomFields for a custom field without selections', () => {
      const filters = searchWithConditions([
        { entity: 'customFieldA', selections: [] }
      ]);

      expect(filters.orgCustomFields).toBeUndefined();
    });

    it('should add the custom field values to orgCustomFields', () => {
      const filters = searchWithConditions([
        { entity: 'customFieldA', selections: [{ fieldValue: 'value-1' }, { fieldValue: 'value-2' }] },
        { entity: 'customFieldB', selections: ['value-3'] }
      ]);

      expect(filters.orgCustomFields).toEqual({
        customFieldA: ['value-1', 'value-2'],
        customFieldB: ['value-3']
      });
    });

    it('should keep only the filled custom fields when an empty condition is present', () => {
      const filters = searchWithConditions([
        { entity: 'customFieldA', selections: ['value-1'] },
        { entity: '', selections: [] }
      ]);

      expect(filters.orgCustomFields).toEqual({ customFieldA: ['value-1'] });
    });
  });

  describe('search - organisation scope', () => {
    it('should restrict a non CCA MDO to its own organisation', () => {
      const filters = searchWithConditions([
        { entity: NsAccessControlConfig.SelectionType.CentralDeputation, selections: [true] }
      ]);

      expect(filters.rootOrgId).toEqual(['own-org']);
      expect(filters.status).toBe(1);
    });

    const serviceAndDeputation = [
      { entity: NsAccessControlConfig.SelectionType.Service, selections: ['indian administrative service (ias)'] },
      { entity: NsAccessControlConfig.SelectionType.CentralDeputation, selections: [true] }
    ];

    it('should never send the "Select all" placeholder as an organisation id', () => {
      const filters = searchWithConditions([
        { entity: NsAccessControlConfig.SelectionType.Organizations, selections: [ALL_ORGANISATIONS_SELECTION] },
        ...serviceAndDeputation
      ]);

      expect(filters.rootOrgId ?? []).not.toContain(ALL_ORGANISATIONS_SELECTION);
    });

    it('should search the whole ministry / state when a L0 selected all organisations', () => {
      accessControlService.getOrgHierarchyOrgIds.mockReturnValue(['own-org', 'l1-org']);
      accessControlService.isL0MdoUser.mockReturnValue(true);

      const filters = searchWithConditions([
        { entity: NsAccessControlConfig.SelectionType.Organizations, selections: [ALL_ORGANISATIONS_SELECTION] },
        ...serviceAndDeputation
      ]);

      expect(filters[MINISTRY_OR_STATE_FILTER_KEY]).toEqual(['own-org']);
      expect(filters.rootOrgId).toBeUndefined();
      expect(filters[CENTRAL_DEPUTATION_KEY]).toBe(true);
      expect(filters['profileDetails.cadreDetails.civilServiceName']).toEqual(['indian administrative service (ias)']);
    });

    it('should search the whole ministry / state when a L0 picked every organisation of its hierarchy', () => {
      accessControlService.getOrgHierarchyOrgIds.mockReturnValue(['own-org', 'l1-org']);
      accessControlService.isL0MdoUser.mockReturnValue(true);
      accessControlService.areAllOrgHierarchyOrgsSelected.mockReturnValue(true);

      const filters = searchWithConditions([
        { entity: NsAccessControlConfig.SelectionType.Organizations, selections: ['own-org', 'l1-org'] }
      ]);

      expect(filters[MINISTRY_OR_STATE_FILTER_KEY]).toEqual(['own-org']);
      expect(filters.rootOrgId).toBeUndefined();
    });

    it('should search every organisation of the branch when a L1 -> L10 selected all organisations', () => {
      accessControlService.getOrgHierarchyOrgIds.mockReturnValue(['l1-org', 'l2-org']);

      const filters = searchWithConditions([
        { entity: NsAccessControlConfig.SelectionType.Organizations, selections: [ALL_ORGANISATIONS_SELECTION] },
        ...serviceAndDeputation
      ]);

      expect(filters.rootOrgId).toEqual(['l1-org', 'l2-org']);
      expect(filters).not.toHaveProperty(MINISTRY_OR_STATE_FILTER_KEY);
    });

    it('should fall back to the own organisation when "Select all" has no hierarchy to expand', () => {
      const filters = searchWithConditions([
        { entity: NsAccessControlConfig.SelectionType.Organizations, selections: [ALL_ORGANISATIONS_SELECTION] }
      ]);

      expect(filters.rootOrgId).toEqual(['own-org']);
    });

    it('should search across every organisation when a CCA selected all of them', () => {
      config.userConfig.org.isCCA = true;

      const filters = searchWithConditions([
        { entity: NsAccessControlConfig.SelectionType.Organizations, selections: [ALL_ORGANISATIONS_SELECTION] },
        ...serviceAndDeputation
      ]);

      expect(filters.rootOrgId).toBeUndefined();
      expect(filters).not.toHaveProperty(MINISTRY_OR_STATE_FILTER_KEY);
      expect(filters[CENTRAL_DEPUTATION_KEY]).toBe(true);
    });

    it('should keep a L0 partial selection as the picked organisations', () => {
      accessControlService.getOrgHierarchyOrgIds.mockReturnValue(['own-org', 'l1-org']);
      accessControlService.isL0MdoUser.mockReturnValue(true);

      const filters = searchWithConditions([
        { entity: NsAccessControlConfig.SelectionType.Organizations, selections: ['l1-org'] }
      ]);

      expect(filters.rootOrgId).toEqual(['l1-org']);
      expect(filters).not.toHaveProperty(MINISTRY_OR_STATE_FILTER_KEY);
    });
  });
});
