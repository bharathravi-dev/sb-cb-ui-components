import { FormBuilder } from '@angular/forms';
import { of } from 'rxjs';

import { AccessControlComponent } from './access-control.component';
import { NsAccessControlConfig } from '../../_models/access-control.model';
import { ALL_ORGANISATIONS_SELECTION, MINISTRY_OR_STATE_FILTER_KEY } from '../../_constants/app.constants';
import { ConfirmDialogComponent } from '../dialogs/confirm-dialog/confirm-dialog.component';
import { SaveUserGroupComponent } from '../dialogs/save-user-group/save-user-group.component';

describe('AccessControlComponent', () => {
  let component: AccessControlComponent;
  let dialog: { open: jest.Mock };
  let accessControlService: any;
  const fb = new FormBuilder();

  const dialogResult = (result: any) => ({ afterClosed: () => of(result) });

  const addGroup = (savedUserGroupId: string, selections: any[] = ['org-a']) => {
    component.userGroup.push(
      fb.group({
        id: ['group-1'],
        savedUserGroupId: [savedUserGroupId],
        name: ['User Group 1'],
        conditions: fb.array([
          fb.group({
            id: ['condition-1'],
            entity: [NsAccessControlConfig.SelectionType.Organizations],
            conditionType: ['is'],
            selections: [selections]
          })
        ])
      })
    );
  };

  beforeEach(() => {
    dialog = { open: jest.fn() };
    accessControlService = {
      isL0MdoUser: jest.fn(() => false),
      areAllOrgHierarchyOrgsSelected: jest.fn(() => false),
      getLoggedInOrgId: jest.fn(() => 'own-org'),
      enableDeputation: jest.fn()
    };
    component = new AccessControlComponent(dialog as any, fb, accessControlService, {} as any, {} as any);
    component.config = {
      application: NsAccessControlConfig.Application.MDO,
      userConfig: { rootOrgId: 'own-org', org: { isCCA: true } }
    } as any;
    component.isCCA = true;
    component.accessControlCriteriaSelection = { optionsEntity: [] } as any;
    component.initForm();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('isAllOrganisationsSelection', () => {
    it('should be true for the "Select all" selection on MDO', () => {
      expect(component.isAllOrganisationsSelection([ALL_ORGANISATIONS_SELECTION])).toBe(true);
    });

    it('should be true for a non CCA MDO as well', () => {
      component.isCCA = false;
      expect(component.isAllOrganisationsSelection([ALL_ORGANISATIONS_SELECTION])).toBe(true);
    });

    it('should be false for picked organisations', () => {
      expect(component.isAllOrganisationsSelection(['org-a'])).toBe(false);
    });

    it('should be false on the creation portal', () => {
      component.config.application = NsAccessControlConfig.Application.Creation_Portal;
      expect(component.isAllOrganisationsSelection([ALL_ORGANISATIONS_SELECTION])).toBe(false);
    });
  });

  describe('organisation criteria', () => {
    it('should save "Select all" as an empty rootOrgId list', () => {
      expect((component as any).createOrganisationCriteria([ALL_ORGANISATIONS_SELECTION])).toEqual({
        criteriaKey: 'rootOrgId',
        criteriaValue: []
      });
    });

    it('should save "Select all" of a L0 as its own ministry / state', () => {
      component.isCCA = false;
      component.canSelectOrgHierarchy = true;
      accessControlService.isL0MdoUser.mockReturnValue(true);

      expect((component as any).createOrganisationCriteria([ALL_ORGANISATIONS_SELECTION])).toEqual({
        criteriaKey: 'ministryOrStateId',
        criteriaValue: ['own-org']
      });
    });

    it('should save "Select all" of a L1 -> L10 as every organisation of its branch', () => {
      component.isCCA = false;
      component.canSelectOrgHierarchy = true;
      accessControlService.getOrgHierarchyOrgIds = jest.fn(() => ['l1-org', 'l2-org']);

      expect((component as any).createOrganisationCriteria([ALL_ORGANISATIONS_SELECTION])).toEqual({
        criteriaKey: 'rootOrgId',
        criteriaValue: ['l1-org', 'l2-org']
      });
    });

    it('should reopen the whole branch of a L1 -> L10 as "Select all"', () => {
      component.isCCA = false;
      component.canSelectOrgHierarchy = true;
      accessControlService.areAllOrgHierarchyOrgsSelected.mockReturnValue(true);

      expect((component as any).isSavedBranchSelectAll('rootOrgId', ['l1-org', 'l2-org'])).toBe(true);
    });

    it('should reopen a saved ministry / state of a L0 as "Select all"', () => {
      component.isCCA = false;
      component.canSelectOrgHierarchy = true;
      accessControlService.isL0MdoUser.mockReturnValue(true);

      expect((component as any).getMinistryOrStateSelections(['own-org'])).toEqual([ALL_ORGANISATIONS_SELECTION]);
    });

    it('should save picked organisations as they were picked', () => {
      expect((component as any).createOrganisationCriteria(['org-a', 'org-b'])).toEqual({
        criteriaKey: 'rootOrgId',
        criteriaValue: ['org-a', 'org-b']
      });
    });

    it('should not append the own organisation to a non CCA group that selected all organisations', () => {
      component.isCCA = false;
      const criteria = [(component as any).createOrganisationCriteria([ALL_ORGANISATIONS_SELECTION])];

      (component as any).appendOwnOrganisationCriteria(criteria);

      expect(criteria).toEqual([{ criteriaKey: 'rootOrgId', criteriaValue: [] }]);
    });
  });

  describe('isSavedAllOrganisationsCriteria', () => {
    const isSavedAll = (criteriaKey: string, criteriaValue: any) =>
      (component as any).isSavedAllOrganisationsCriteria(criteriaKey, criteriaValue);

    it('should read an empty rootOrgId list as "Select all"', () => {
      expect(isSavedAll('rootOrgId', [])).toBe(true);
    });

    it('should read a rootOrgId without a list as "Select all"', () => {
      expect(isSavedAll('rootOrgId', null)).toBe(true);
      expect(isSavedAll('rootOrgId', undefined)).toBe(true);
    });

    it('should not read picked organisations as "Select all"', () => {
      expect(isSavedAll('rootOrgId', ['org-a'])).toBe(false);
    });

    it('should not read any other empty criteria as "Select all"', () => {
      expect(isSavedAll('designation', [])).toBe(false);
    });

    it('should not read it as "Select all" on the creation portal', () => {
      component.config.application = NsAccessControlConfig.Application.Creation_Portal;
      expect(isSavedAll('rootOrgId', [])).toBe(false);
    });
  });

  describe('restoring a saved "Select all" group', () => {
    beforeEach(() => {
      jest.spyOn(component, 'processDisableAddConditionOnClose').mockImplementation(() => undefined);
      jest.spyOn(component, 'calculateUserCountForUserGroup').mockResolvedValue(undefined);
    });

    it('should show every organisation as selected', () => {
      const isAdded = (component as any).addUserGroupFromCriteria('Group', [{ criteriaKey: 'rootOrgId', criteriaValue: [] }]);

      expect(isAdded).toBe(true);
      const condition = component.ruleConditions(0).at(0);
      expect(condition.get('entity')?.value).toBe(NsAccessControlConfig.SelectionType.Organizations);
      expect(condition.get('selections')?.value).toEqual([ALL_ORGANISATIONS_SELECTION]);
    });

    it('should skip the organisation condition for a MDO that is offered none', () => {
      component.isCCA = false;
      component.canSelectOrgHierarchy = false;

      const isAdded = (component as any).addUserGroupFromCriteria('Group', [{ criteriaKey: 'rootOrgId', criteriaValue: [] }]);

      expect(isAdded).toBe(false);
    });

    it('should show the whole branch of a L1 -> L10 as "Select all"', () => {
      component.isCCA = false;
      component.canSelectOrgHierarchy = true;
      accessControlService.areAllOrgHierarchyOrgsSelected.mockReturnValue(true);

      const isAdded = (component as any).addUserGroupFromCriteria('Group', [
        { criteriaKey: 'rootOrgId', criteriaValue: ['l1-org', 'l2-org'] }
      ]);

      expect(isAdded).toBe(true);
      expect(component.ruleConditions(0).at(0).get('selections')?.value).toEqual([ALL_ORGANISATIONS_SELECTION]);
    });

    it('should treat a restored saved group as unchanged', () => {
      (component as any).addUserGroupFromCriteria('Group', [{ criteriaKey: 'rootOrgId', criteriaValue: ['org-a'] }], 'saved-group-id');

      expect(component.isSavedUserGroupUnchanged(0)).toBe(true);
    });
  });

  describe('isSavedUserGroupUnchanged', () => {
    it('should be false for a group that is not saved yet', () => {
      addGroup('');
      (component as any).markUserGroupConditionsSaved(0);

      expect(component.isSavedUserGroupUnchanged(0)).toBe(false);
    });

    it('should be false for a saved group whose conditions were never marked saved', () => {
      addGroup('saved-group-id');

      expect(component.isSavedUserGroupUnchanged(0)).toBe(false);
    });

    it('should be true while the saved conditions are not edited', () => {
      addGroup('saved-group-id');
      (component as any).markUserGroupConditionsSaved(0);

      expect(component.isSavedUserGroupUnchanged(0)).toBe(true);
    });

    it('should be false once the selections are edited', () => {
      addGroup('saved-group-id');
      (component as any).markUserGroupConditionsSaved(0);

      component.ruleConditions(0).at(0).get('selections')?.setValue(['org-a', 'org-b']);

      expect(component.isSavedUserGroupUnchanged(0)).toBe(false);
    });

    it('should ignore a change of the group name', () => {
      addGroup('saved-group-id');
      (component as any).markUserGroupConditionsSaved(0);

      component.userGroup.at(0).get('name')?.setValue('Renamed group');

      expect(component.isSavedUserGroupUnchanged(0)).toBe(true);
    });
  });

  describe('createUserGroup / updateUserGroup', () => {
    const payload = { request: { userGroupName: 'Group', criteria: [{ criteriaKey: 'rootOrgId', criteriaValue: ['org-a'] }] } };

    beforeEach(() => {
      jest.spyOn(component, 'callSnackbar').mockImplementation(() => undefined);
      jest.spyOn(component.accessControlData, 'emit');
    });

    it('should keep the new id and treat the created group as unchanged', () => {
      accessControlService.createReusableUserGroup = jest.fn(() => of({ result: { usergroupid: 'new-group-id', accessControl: { userGroups: [] } } }));
      addGroup('');

      component.createUserGroup(payload as any, 0);

      expect(component.userGroup.at(0).get('savedUserGroupId')?.value).toBe('new-group-id');
      expect(component.isSavedUserGroupUnchanged(0)).toBe(true);
      expect(component.isSavingReusableUserGroup).toBe(false);
      expect(component.accessControlData.emit).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATED', userGroupId: 'new-group-id' }));
      expect(component.callSnackbar).toHaveBeenCalledWith('User group saved successfully', 'success');
    });

    it('should treat the updated group as unchanged', () => {
      accessControlService.updateReusableUserGroup = jest.fn(() => of({ result: { usergroupid: 'saved-group-id', accessControl: { userGroups: [] } } }));
      addGroup('saved-group-id');
      component.ruleConditions(0).at(0).get('selections')?.setValue(['org-b']);

      component.updateUserGroup({ request: { ...payload.request, userGroupId: 'saved-group-id' } } as any, 0);

      expect(component.isSavedUserGroupUnchanged(0)).toBe(true);
      expect(component.isSavingReusableUserGroup).toBe(false);
      expect(component.accessControlData.emit).toHaveBeenCalledWith(expect.objectContaining({ action: 'UPDATED' }));
      expect(component.callSnackbar).toHaveBeenCalledWith('User group updated successfully', 'success');
    });

    it('should not treat the group as saved when the update fails', () => {
      accessControlService.updateReusableUserGroup = jest.fn(() => of({}));
      addGroup('saved-group-id');

      component.updateUserGroup({ request: { ...payload.request, userGroupId: 'saved-group-id' } } as any, 0);

      expect(component.isSavedUserGroupUnchanged(0)).toBe(false);
      expect(component.callSnackbar).toHaveBeenCalledWith('Could not update the user group, Please try again.', 'error');
    });
  });

  describe('calculateUserCountForUserGroup', () => {
    it('should read the user count across every organisation when a CCA selected all of them', async () => {
      accessControlService.accessControlConfig = jest.fn(() => component.config);
      accessControlService.validateUser = jest.fn(() => of({ result: { response: { count: 12 } } }));
      addGroup('', [ALL_ORGANISATIONS_SELECTION]);

      await component.calculateUserCountForUserGroup(0);

      expect(accessControlService.validateUser).toHaveBeenCalledWith({
        request: { filters: { status: 1 }, fields: ['identifier', 'rootOrgId', 'firstName'] }
      });
      expect(component.userCount[0]).toBe(12);
    });

    describe('for a non CCA MDO', () => {
      beforeEach(() => {
        component.isCCA = false;
        component.canSelectOrgHierarchy = true;
        component.config.userConfig.org = { isCCA: false, rootOrgId: 'own-org' } as any;
        accessControlService.accessControlConfig = jest.fn(() => component.config);
        accessControlService.validateUser = jest.fn(() => of({ result: { response: { count: 7 } } }));
        accessControlService.getOrgHierarchyOrgIds = jest.fn(() => ['l1-org', 'l2-org']);
      });

      it('should count the whole ministry / state when a L0 selected all organisations', async () => {
        accessControlService.isL0MdoUser.mockReturnValue(true);
        addGroup('', [ALL_ORGANISATIONS_SELECTION]);

        await component.calculateUserCountForUserGroup(0);

        expect(accessControlService.validateUser).toHaveBeenCalledWith({
          request: {
            filters: { [MINISTRY_OR_STATE_FILTER_KEY]: ['own-org'], status: 1 },
            fields: ['identifier', 'rootOrgId', 'firstName']
          }
        });
        expect(component.userCount[0]).toBe(7);
      });

      it('should count the whole ministry / state when a L0 picked every organisation of its hierarchy', async () => {
        accessControlService.isL0MdoUser.mockReturnValue(true);
        accessControlService.areAllOrgHierarchyOrgsSelected.mockReturnValue(true);
        addGroup('', ['l1-org', 'l2-org']);

        await component.calculateUserCountForUserGroup(0);

        const filters = accessControlService.validateUser.mock.calls[0][0].request.filters;
        expect(filters).toEqual({ [MINISTRY_OR_STATE_FILTER_KEY]: ['own-org'], status: 1 });
        expect(filters).not.toHaveProperty('rootOrgId');
      });

      it('should count every organisation of the branch when a L1 -> L10 selected all organisations', async () => {
        addGroup('', [ALL_ORGANISATIONS_SELECTION]);

        await component.calculateUserCountForUserGroup(0);

        const filters = accessControlService.validateUser.mock.calls[0][0].request.filters;
        expect(filters).toEqual({ rootOrgId: ['l1-org', 'l2-org'], status: 1 });
        expect(filters).not.toHaveProperty(MINISTRY_OR_STATE_FILTER_KEY);
      });

      it('should count the picked organisations of a L0 partial selection', async () => {
        accessControlService.isL0MdoUser.mockReturnValue(true);
        addGroup('', ['l1-org']);

        await component.calculateUserCountForUserGroup(0);

        const filters = accessControlService.validateUser.mock.calls[0][0].request.filters;
        expect(filters).toEqual({ rootOrgId: ['l1-org'], status: 1 });
      });

      describe('with service and central deputation', () => {
        const addGroupWithDeputation = (deputation: any) => {
          component.userGroup.push(
            fb.group({
              id: ['group-1'],
              savedUserGroupId: [''],
              name: ['User Group 1'],
              conditions: fb.array([
                fb.group({ id: ['c-1'], entity: [NsAccessControlConfig.SelectionType.Organizations], conditionType: ['is'], selections: [[ALL_ORGANISATIONS_SELECTION]] }),
                fb.group({ id: ['c-2'], entity: [NsAccessControlConfig.SelectionType.Service], conditionType: ['is'], selections: [['indian administrative service (ias)']] }),
                fb.group({ id: ['c-3'], entity: [NsAccessControlConfig.SelectionType.CentralDeputation], conditionType: ['is'], selections: [deputation] })
              ])
            })
          );
        };

        const countFilters = async (deputation: any) => {
          accessControlService.isL0MdoUser.mockReturnValue(true);
          addGroupWithDeputation(deputation);
          await component.calculateUserCountForUserGroup(0);
          return accessControlService.validateUser.mock.calls[0][0].request.filters;
        };

        it('should send a boolean central deputation beside the ministry / state', async () => {
          const filters = await countFilters([true]);

          expect(filters).toEqual({
            [MINISTRY_OR_STATE_FILTER_KEY]: ['own-org'],
            'profileDetails.cadreDetails.civilServiceName': ['indian administrative service (ias)'],
            'profileDetails.cadreDetails.isOnCentralDeputation': true,
            status: 1
          });
        });

        it('should convert a "true" string from a reopened group to a boolean', async () => {
          const filters = await countFilters(['true']);

          expect(filters['profileDetails.cadreDetails.isOnCentralDeputation']).toBe(true);
          expect(filters[MINISTRY_OR_STATE_FILTER_KEY]).toEqual(['own-org']);
        });

        it('should convert a "false" string from a reopened group to a boolean', async () => {
          const filters = await countFilters(['false']);

          expect(filters['profileDetails.cadreDetails.isOnCentralDeputation']).toBe(false);
        });

        it('should accept a central deputation value not wrapped in an array', async () => {
          const filters = await countFilters(true);

          expect(filters['profileDetails.cadreDetails.isOnCentralDeputation']).toBe(true);
        });

        it('should leave the flag out for an unrecognised value', async () => {
          const filters = await countFilters(['yes']);

          expect(filters).not.toHaveProperty('profileDetails.cadreDetails.isOnCentralDeputation');
        });
      });

      describe('org custom fields', () => {
        const addGroupWithConditions = (conditions: { entity: string; selections: any }[]) => {
          component.userGroup.push(
            fb.group({
              id: ['group-1'],
              savedUserGroupId: [''],
              name: ['User Group 1'],
              conditions: fb.array(
                conditions.map((condition, index) =>
                  fb.group({ id: [`c-${index}`], entity: [condition.entity], conditionType: ['is'], selections: [condition.selections] })
                )
              )
            })
          );
        };

        const countFilters = async (conditions: { entity: string; selections: any }[]) => {
          accessControlService.isL0MdoUser.mockReturnValue(true);
          addGroupWithConditions(conditions);
          await component.calculateUserCountForUserGroup(0);
          return accessControlService.validateUser.mock.calls[0][0].request.filters;
        };

        it('should not send orgCustomFields for a condition without an entity', async () => {
          const filters = await countFilters([
            { entity: NsAccessControlConfig.SelectionType.Organizations, selections: [ALL_ORGANISATIONS_SELECTION] },
            { entity: '', selections: [] }
          ]);

          expect(filters).toEqual({ [MINISTRY_OR_STATE_FILTER_KEY]: ['own-org'], status: 1 });
        });

        it('should not send orgCustomFields for a custom field without selections', async () => {
          const filters = await countFilters([
            { entity: NsAccessControlConfig.SelectionType.Organizations, selections: [ALL_ORGANISATIONS_SELECTION] },
            { entity: 'customFieldA', selections: [] }
          ]);

          expect(filters).not.toHaveProperty('orgCustomFields');
        });

        it('should send the filled custom fields only', async () => {
          const filters = await countFilters([
            { entity: NsAccessControlConfig.SelectionType.Organizations, selections: [ALL_ORGANISATIONS_SELECTION] },
            { entity: 'customFieldA', selections: [{ fieldValue: 'value-1' }, 'value-2'] },
            { entity: '', selections: [] }
          ]);

          expect(filters.orgCustomFields).toEqual({ customFieldA: ['value-1', 'value-2'] });
        });
      });

      it('should restrict the count to the own organisation when the hierarchy cannot be selected', async () => {
        component.canSelectOrgHierarchy = false;
        addGroup('', ['org-a']);

        await component.calculateUserCountForUserGroup(0);

        const filters = accessControlService.validateUser.mock.calls[0][0].request.filters;
        expect(filters).toEqual({ rootOrgId: ['own-org'], status: 1 });
      });
    });
  });

  describe('saveReusableUserGroups', () => {
    let updateUserGroup: jest.SpyInstance;
    let createUserGroup: jest.SpyInstance;

    beforeEach(() => {
      updateUserGroup = jest.spyOn(component, 'updateUserGroup').mockImplementation(() => undefined);
      createUserGroup = jest.spyOn(component, 'createUserGroup').mockImplementation(() => undefined);
    });

    it('should confirm first, then ask for the name, then update a saved group of live content', () => {
      component.mdoContent = { status: 'Live' };
      addGroup('saved-group-id');
      dialog.open
        .mockReturnValueOnce(dialogResult({ action: NsAccessControlConfig.IActions.Confirm }))
        .mockReturnValueOnce(dialogResult({ action: NsAccessControlConfig.IActions.Confirm, userGroupName: 'Renamed group' }));

      component.saveReusableUserGroups(0);

      expect(dialog.open.mock.calls[0][0]).toBe(ConfirmDialogComponent);
      expect(dialog.open.mock.calls[0][1].data).toEqual({ type: 'confirm-update-reusable-group' });
      expect(dialog.open.mock.calls[1][0]).toBe(SaveUserGroupComponent);
      expect(updateUserGroup).toHaveBeenCalledWith(
        {
          request: {
            userGroupId: 'saved-group-id',
            userGroupName: 'Renamed group',
            criteria: [{ criteriaKey: 'rootOrgId', criteriaValue: ['org-a'] }]
          }
        },
        0
      );
      expect(createUserGroup).not.toHaveBeenCalled();
    });

    it('should not ask for the name when the update is not confirmed', () => {
      component.mdoContent = { status: 'Live' };
      addGroup('saved-group-id');
      dialog.open.mockReturnValueOnce(dialogResult({ action: NsAccessControlConfig.IActions.Reject }));

      component.saveReusableUserGroups(0);

      expect(dialog.open).toHaveBeenCalledTimes(1);
      expect(updateUserGroup).not.toHaveBeenCalled();
    });

    it('should skip the confirmation and ask for the name to update a saved group of content that is not live', () => {
      component.mdoContent = { status: 'Draft' };
      addGroup('saved-group-id');
      dialog.open.mockReturnValueOnce(dialogResult({ action: NsAccessControlConfig.IActions.Confirm, userGroupName: 'Renamed group' }));

      component.saveReusableUserGroups(0);

      expect(dialog.open).toHaveBeenCalledTimes(1);
      expect(dialog.open.mock.calls[0][0]).toBe(SaveUserGroupComponent);
      expect(updateUserGroup).toHaveBeenCalledWith(
        {
          request: {
            userGroupId: 'saved-group-id',
            userGroupName: 'Renamed group',
            criteria: [{ criteriaKey: 'rootOrgId', criteriaValue: ['org-a'] }]
          }
        },
        0
      );
    });

    it('should not update when the name dialog is cancelled', () => {
      component.mdoContent = { status: 'Live' };
      addGroup('saved-group-id');
      dialog.open
        .mockReturnValueOnce(dialogResult({ action: NsAccessControlConfig.IActions.Confirm }))
        .mockReturnValueOnce(dialogResult({ action: NsAccessControlConfig.IActions.Reject }));

      component.saveReusableUserGroups(0);

      expect(updateUserGroup).not.toHaveBeenCalled();
    });

    it('should go straight to the name dialog and create a group that is not saved yet', () => {
      addGroup('');
      dialog.open.mockReturnValueOnce(dialogResult({ action: NsAccessControlConfig.IActions.Confirm, userGroupName: 'New group' }));

      component.saveReusableUserGroups(0);

      expect(dialog.open).toHaveBeenCalledTimes(1);
      expect(dialog.open.mock.calls[0][0]).toBe(SaveUserGroupComponent);
      expect(createUserGroup).toHaveBeenCalledWith(
        { request: { userGroupName: 'New group', criteria: [{ criteriaKey: 'rootOrgId', criteriaValue: ['org-a'] }] } },
        0
      );
      expect(updateUserGroup).not.toHaveBeenCalled();
    });

    it('should save "Select all" as an empty rootOrgId list', () => {
      addGroup('', [ALL_ORGANISATIONS_SELECTION]);
      dialog.open.mockReturnValueOnce(dialogResult({ action: NsAccessControlConfig.IActions.Confirm, userGroupName: 'All orgs' }));

      component.saveReusableUserGroups(0);

      expect(createUserGroup).toHaveBeenCalledWith(
        { request: { userGroupName: 'All orgs', criteria: [{ criteriaKey: 'rootOrgId', criteriaValue: [] }] } },
        0
      );
    });
  });
});
