import { AfterViewInit, Component, EventEmitter, Input, OnDestroy, OnInit, Output, signal } from "@angular/core";
import { MatDialog } from "@angular/material/dialog";
// import { Router } from "@angular/router";
import { InviteUsersComponent } from "../dialogs/invite-users/invite-users.component";
import { IReusableUserGroupRequest, IUserGroupRequest, NsAccessControlConfig } from "../../_models/access-control.model";
import { FormBuilder, FormGroup, FormArray, Validators } from "@angular/forms";
import { AccessControlService } from "../../_services/access-control.service";
import { EntitySelectionsComponent } from "../dialogs/entity-selections/entity-selections.component";
import { v4 as uuidv4 } from "uuid";
import { CadreMappingService } from "../../_services/cadre-mapping.service";
import { SnackbarComponent } from "../../components/snackbar/snackbar.component";
import { MatSnackBar } from "@angular/material/snack-bar";
import { ConfirmDialogComponent } from "../dialogs/confirm-dialog/confirm-dialog.component";
import { AccessControlGuideComponent } from "../dialogs/access-control-guide/access-control-guide.component";
import { SaveUserGroupComponent } from "../dialogs/save-user-group/save-user-group.component";
import { ReuseUserGroupComponent } from "../dialogs/reuse-user-group/reuse-user-group.component";
import { Subject } from "rxjs";
import { takeUntil } from "rxjs/operators";
import { MatRadioChange } from "@angular/material/radio";
import * as _ from "lodash";
import { ALL_ORGANISATIONS_SELECTION, MINISTRY_OR_STATE_CRITERIA_KEY, MINISTRY_OR_STATE_FILTER_KEY } from "../../_constants/app.constants";

@Component({
    selector: "sb-uic-access-control",
    templateUrl: "./access-control.component.html",
    styleUrls: ["./access-control.component.scss"],
    standalone: false
})
export class AccessControlComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() config!: NsAccessControlConfig.IAccessControlConfig;
  @Input() contentId: string = "";
  @Input() content: any;
  @Input() tempAccessControl: any;

  @Output() accessControlData: EventEmitter<{ userGroup: any; accessType: string; action?: string; userGroupId?: string }> = new EventEmitter();
  @Output() refreshContentMeta: EventEmitter<boolean> = new EventEmitter();
  @Output() sendForCQF: EventEmitter<boolean> = new EventEmitter();

  private destroy$ = new Subject<void>();

  accessType: NsAccessControlConfig.ITypeAccessType = NsAccessControlConfig.IAccessTypes.Public;
  accessTypeDup: NsAccessControlConfig.ITypeAccessType = NsAccessControlConfig.IAccessTypes.Public;
  ACCESS_TYPE_ENUM = NsAccessControlConfig.IAccessTypes;
  ACCESS_SETTING_ENUM = NsAccessControlConfig.IAccessSetting;

  isLoading = false;
  isVisibilityEnabled: boolean = true;
  filterCriteria: boolean = false;

  defaultConditionRelationship: string = "AND";
  defaultUserGroupRelationship: string = "OR";

  accessControlCriteriaSelection!: NsAccessControlConfig.IAccessControlCriteriaSelection;
  usersTableConfig!: NsAccessControlConfig.ITableConfig;
  accessControlForm!: FormGroup;
  MDO_SPECIFIC = NsAccessControlConfig.IAccessSetting.MDO_SPECIFIC;
  MDO_APPLICATION = NsAccessControlConfig.Application.MDO;
  CBP_APPLICATION = NsAccessControlConfig.Application.Creation_Portal;

  cadreConfigData: any;
  isSaveFltrBtnDisabled = true;
  isAddUserGroupBtnDisabled = false;
  isSaving = false;
  isSavingReusableUserGroup = false;
  isApplyingSavedUserGroup = false;
  userCount: any = {};

  initialUserGroupValue: any;

  REUSABLE_USER_GROUP = "reusable-user-groups";

  canShowAccessControlTypeRadio = true;
  shouldShowVisibilityToggle = true;
  isCCA = false;
  // Non CCA L0 MDO (mdo_admin / mdo_leader of a ministry / state) can select organisations
  // from its own org hierarchy framework. Stays false when the framework is not created.
  canSelectOrgHierarchy = false;
  mdoContent: any;
  savedUserGroupConditions = new Map<string, string>();

  constructor(
    private dialog: MatDialog,
    private fb: FormBuilder,
    private accessControlService: AccessControlService,
    private cadreMappingService: CadreMappingService,
    private snackbar: MatSnackBar,
    // private router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    this.initForm();

    if (this.config?.application === NsAccessControlConfig.Application.MDO) {
      this.isLoading = true
      this.isCCA = this.config?.userConfig?.org?.isCCA ?? false;
      if (!this.isCCA) {
        // the L0 above this organisation answers both for its hierarchy and for the state whose
        // services it may select from, so it is read once here for the two of them
        await this.accessControlService.readParentOrganisation(this.config);
        await this.loadOrgHierarchyOrganisations();
        // Organisation condition is only available to a non CCA MDO whose organisation is part of
        // an org hierarchy framework, at any level of it. One that is in no hierarchy, or whose
        // L0 has no framework created yet, keeps working within its own organisation
        if (!this.canSelectOrgHierarchy) {
          this.config.accessControlCriteriaSelection.optionsEntity = _.filter(
            this.config.accessControlCriteriaSelection.optionsEntity,
            (entity) => entity.value !== NsAccessControlConfig.SelectionType.Organizations
          );
        }
      }

      this.mdoContent = this.config?.mdoContent
    }

    this.config.content = this.content;
    this.accessControlCriteriaSelection = this.config?.accessControlCriteriaSelection;

    if (this.accessControlCriteriaSelection.readOnly) {
      this.accessControlCriteriaSelection.readOnly = false;
    }

    this.usersTableConfig = this.config?.usersTableConfig;

    // Dont call read api for MDO its only for CBP for now
    if (this.config.application !== NsAccessControlConfig.Application.MDO) {
      this.getAccessControl();
    }

    if (!this.cadreConfigData) {
      this.fetchCadreConfigData();
    }

    if (this.content && !this.content?.externalId) {
      const isComprehensiveCategory = this.content.courseCategory === "Comprehensive Assessment Program";
      const isAllUsers = this.content.accessSetting === NsAccessControlConfig.IAccessSetting.ALL_USERS;
      const isCustomAccess =
        this.content.accessSetting === NsAccessControlConfig.IAccessSetting.MDO_SPECIFIC ||
        this.content.accessSetting === NsAccessControlConfig.IAccessSetting.CUSTOME_USER;

      const accessTypePublic = _.find(this.accessControlCriteriaSelection?.accessTypes, {
        value: NsAccessControlConfig.IAccessTypes.Public
      });

      if (isAllUsers) {
        this.accessType = NsAccessControlConfig.IAccessTypes.Public;
        if (accessTypePublic) accessTypePublic.disabled = false;

        if (this.content.accessSettingsEnabled) {
          this.accessType = NsAccessControlConfig.IAccessTypes.Custom;
        }
      }

      if (isCustomAccess || isComprehensiveCategory) {
        this.accessType = NsAccessControlConfig.IAccessTypes.Custom;
        if (accessTypePublic) accessTypePublic.disabled = true;
      }

      this.processConditionsForContentType();
    } else if(this.config.application === NsAccessControlConfig.Application.MDO){ 
      // Condition for MDO
      this.accessType = NsAccessControlConfig.IAccessTypes.Custom;
    } 
    // For curated content of marketplace with external id 
    else if(this.content && this.content?.externalId) {
      this.accessType = NsAccessControlConfig.IAccessTypes.Custom;
    }

    this.canShowAccessControlTypeRadio = this.config?.accessControlCriteriaSelection?.canShowAccessTypeRadio ?? true;
    this.shouldShowVisibilityToggle = this.config?.accessControlCriteriaSelection?.shouldShowVisibilityToggle ?? true;
    this.accessTypeDup = this.accessType;

    // Add config to signal 
    this.accessControlService.accessControlConfig.set(this.config);
    if (this.config.accessControlCriteriaSelection.allowCustomsField && !this.isCCA) {
      await this.getCustomsField();
    }

   if(this.config.application === this.MDO_APPLICATION) {
     if (this.tempAccessControl) {
      this.processTempAccessControl(this.tempAccessControl);
    } else {
      // Check if 'create-plan' is in the URL and auto-create organization filter
      // const isCreatePlanUrl = this.router?.url?.includes('create-plan');
      
      // Auto-create organization filter for 'create-plan' URL if no user groups exist - IGNORE for now as per discussion, we will revisit this once we have clarity on the flow after plan creation
      
      // if (isCreatePlanUrl && this.userGroup?.length === 0) {
      //   // Create Organization condition
      //   const orgCondition = this.createConditionGroup(uuidv4(), 0);
      //   orgCondition.get("entity")?.setValue(NsAccessControlConfig.SelectionType.Organizations);
      //   orgCondition.get("selections").setrouterValue([this.config?.userConfig?.rootOrgId]);

       
      //   const group = this.fb.group({
      //     id: [uuidv4()],
      //     name: ["User Group 1"],
      //     description: ["Description for UserGroup 1"],
      //     conditions: this.fb.array([orgCondition]),
      //   });
      //   this.userGroup.push(group);
      // }
      
      // Don't create a default user group yet - wait for API data to load
      // If no data is loaded, the component using this will call addUserGroup
      setTimeout(() => {
        this.initialUserGroupValue = JSON.stringify(this.accessControlForm.getRawValue().userGroup);
        this.setupFormChangeDetection();
      }, 0);
    }
   }

   if (this.content && this.content?.courseCategory === "Comprehensive Assessment Program") {
    this.canShowAccessControlTypeRadio = false;
    this.shouldShowVisibilityToggle = false;
   }

  }

  /**
   * Reads the org hierarchy framework that applies to the logged in organisation and keeps the
   * flattened organisation list (L0 -> L10) ready for the organisation selection dialog.
   *
   * It is not the L0 alone any more: an organisation at any level of the hierarchy is offered
   * the condition, and one below the L0 answers from the framework of the L0 it is mapped to -
   * the framework itself only ever exists on the L0. An organisation outside a hierarchy, or
   * one whose L0 has no framework created yet, resolves to nothing and is offered nothing.
   *
   * The whole of it belongs to the MDO portal. The library is shared with the creation portal,
   * which has no org hierarchy behind it, so the application is checked here as well as at the
   * one place this is called from - neither the org read nor the framework read is worth making
   * anywhere else, and the condition is not worth offering there.
   */
  private async loadOrgHierarchyOrganisations(): Promise<void> {
    this.canSelectOrgHierarchy = false;
    this.accessControlService.orgHierarchyOrganisations.set([]);

    if (this.config?.application !== NsAccessControlConfig.Application.MDO) {
      return;
    }

    if (!this.accessControlService.hasOrgHierarchyRole(this.config)) {
      return;
    }

    const organisations = await this.accessControlService.fetchOrgHierarchyOrganisations(this.config);
    this.canSelectOrgHierarchy = organisations?.length > 0;
  }

  ngAfterViewInit(): void {
    if (this.config?.visiblilityOnOff?.default !== "on") {
      this.isVisibilityEnabled = false;
    }
    localStorage.removeItem("goToSetting");
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  
  async fetchCadreConfigData(): Promise<void> {
    this.isLoading = true;

    const response: any = await this.accessControlService.fetchCadreConfig().catch(() => (this.isLoading = false));
    if (response?.result && response?.result?.response && Object.keys(response?.result?.response)?.length) {
      this.cadreConfigData = response?.result?.response?.value;
      this.cadreMappingService.initialize(this.cadreConfigData);

      this.accessControlService.holdServiceCadrebatch.set({
        service: this.cadreMappingService.getAllServices(),
        batch: this.cadreMappingService.getAllBatchYears(),
        cadre: this.cadreMappingService.getAllCadres(),
      });

      this.cadreMappingService.setCadreConfigData(this.cadreConfigData);

        this.isLoading = false;
    
    }
  }

  initForm() {
    this.accessControlForm = this.fb.group({
      userGroup: this.fb.array([])
    });
  }

  get userGroup(): FormArray {
    return this.accessControlForm.get("userGroup") as FormArray;
  }

  ruleConditions(ruleIndex: number): FormArray {
    return this.userGroup.at(ruleIndex).get("conditions") as FormArray;
  }

  onAccessTypeChange(event: MatRadioChange): void {
    const selectedType = event.value;
    (event?.source?._inputElement?.nativeElement as HTMLElement)?.blur();
    if (selectedType === NsAccessControlConfig.IAccessTypes.Public) {
      const dialogRef = this.dialog.open(ConfirmDialogComponent, {
        width: "470px",
        data: { type: "confirm-access-type" }
      });

      dialogRef.afterClosed().subscribe(result => {
        if (result?.action === NsAccessControlConfig.IActions.Confirm) {
          this.accessType = selectedType;
          this.updateContentAccessSetting();
        } else {
          this.accessTypeDup = this.accessType;
        }
      });
    } else {
      this.accessType = selectedType;
      this.updateContentAccessSetting();
    }
  }

  addUserGroup() {
    const ruleGroup = this.fb.group({
      id: [uuidv4()],
      name: [`User Group ${this.userGroup.length + 1}`],
      description: [`Description for UserGroup ${this.userGroup.length + 1}`],
      conditions: this.fb.array([this.createConditionGroup(uuidv4(), this.userGroup.length - 1)]),
      isUserGroupDisabled: [false],
      isAddConditionDisabled: [false]
    });

    this.userGroup.push(ruleGroup);
    
    // Update Central Deputation availability based on current AIS status
    const hasAIS = this.hasAllIndiaServicesInAnyGroup();
    if (!hasAIS) {
      this.accessControlService.enableDeputation(false);
    }
  }

  addCondition(userGroupIndex: number) {
    this.processCadreConfigMapping(userGroupIndex);
    const conditions = this.ruleConditions(userGroupIndex);
    const accessSetting = this.content?.accessSetting;

    // Check if organization/users already exists based on access setting
    if (accessSetting === NsAccessControlConfig.IAccessSetting.MDO_SPECIFIC || accessSetting === NsAccessControlConfig.IAccessSetting.CUSTOME_USER) {
      const entityType =
        accessSetting === NsAccessControlConfig.IAccessSetting.MDO_SPECIFIC
          ? NsAccessControlConfig.SelectionType.Organizations
          : NsAccessControlConfig.SelectionType.Users;
      const existingEntity = conditions.controls.some(ctrl => ctrl.get("entity")?.value === entityType);

      if (existingEntity) {
        this.callSnackbar(`${entityType.toUpperCase()} is already added in this user group`, "error");
        return;
      }
    }

    // Check if the last condition's selections are empty
    if (conditions?.length > 0) {
      const lastCondition = conditions.at(conditions.length - 1);
      const selections = lastCondition.get("selections")?.value || [];
      if (selections.length === 0) {
        this.callSnackbar("Please select a value for the current condition before adding another one.", "error");
        return;
      }
    }

    // Check if user is added in the condition then no more conditions can be added
    if (conditions?.length > 0) {
      const lastCondition = conditions.at(conditions.length - 1);
      const lastEntity = lastCondition.get("entity")?.value;
      if (lastEntity === NsAccessControlConfig.SelectionType.Users) {
        this.callSnackbar("Adding further condition is not possible , as you have already added User as condition", "error");
        return;
      }
    }

    conditions.push(this.createConditionGroup(uuidv4(), userGroupIndex));
    
    // Update Central Deputation availability based on current AIS status
    const hasAIS = this.hasAllIndiaServicesInAnyGroup();
    if (!hasAIS) {
      this.accessControlService.enableDeputation(false);
    }
  }

  createConditionGroup(id: number, userGroupIndex: number): FormGroup {
    let entity = "";
    const accessSetting = this.content?.accessSetting;
    if (accessSetting === NsAccessControlConfig.IAccessSetting.MDO_SPECIFIC || accessSetting === NsAccessControlConfig.IAccessSetting.CUSTOME_USER) {
      entity =
        accessSetting === NsAccessControlConfig.IAccessSetting.MDO_SPECIFIC
          ? NsAccessControlConfig.SelectionType.Organizations
          : NsAccessControlConfig.SelectionType.Users;
      this.accessControlCriteriaSelection.optionsEntity.forEach((ele: NsAccessControlConfig.IOptionsEntity) => {
        ele.disabled = ele.value !== entity;
      });
    } else {
      // Don't modify optionsEntity here - it will be handled in onOpeningEntityChange
      // Just reset to default state
      this.accessControlCriteriaSelection.optionsEntity.forEach((ele: NsAccessControlConfig.IOptionsEntity) => {
        ele.disabled = false;
      });
    }

    // Disable entity control if readOnly is true
    const isEntityDisabled = !!this.accessControlCriteriaSelection?.readOnly;
    return this.fb.group({
      id: [id],
      entity: [{ value: entity, disabled: isEntityDisabled }, Validators.required],
      conditionType: [{ value: "is", disabled: true }, Validators.required],
      selections: [[]],
      disabledMessage: [""]
    });
  }

  /**
   * Check if any user group has All India Services selected
   */
  private hasAllIndiaServicesInAnyGroup(): boolean {
    const isAllIndiaService = (serviceName: string): boolean => {
      if (!serviceName) return false;
      const lower = serviceName.toLowerCase();
      return lower.includes("all india service") ||
             lower.includes("indian administrative service") ||
             lower.includes("(ias)") ||
             lower.includes("indian police service") ||
             lower.includes("(ips)") ||
             lower.includes("indian forest service") ||
             lower.includes("(ifs)");
    };
    
    for (let i = 0; i < this.userGroup.length; i++) {
      const conditions = this.ruleConditions(i);
      for (let j = 0; j < conditions.length; j++) {
        const condition = conditions.at(j);
        const entity = condition?.get("entity")?.value;
        const selections = condition?.get("selections")?.value || [];
        
        if (entity === NsAccessControlConfig.SelectionType.Service && selections.length > 0) {
          // Check raw selections
          if (selections.some((s: string) => isAllIndiaService(s))) {
            return true;
          }
          
          // Also check through service mapping
          const serviceNames = this.cadreMappingService.getServicesByNames(selections);
          if (serviceNames.some((service) => isAllIndiaService(service.name))) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * Check if a specific user group has All India Services selected
   */
  private hasAllIndiaServicesInUserGroup(userGroupIndex: number): boolean {
    if (userGroupIndex < 0 || userGroupIndex >= this.userGroup.length) {
      return false;
    }
    
    const isAllIndiaService = (serviceName: string): boolean => {
      if (!serviceName) return false;
      const lower = serviceName.toLowerCase();
      return lower.includes("all india service") ||
             lower.includes("indian administrative service") ||
             lower.includes("(ias)") ||
             lower.includes("indian police service") ||
             lower.includes("(ips)") ||
             lower.includes("indian forest service") ||
             lower.includes("(ifs)");
    };
    
    const conditions = this.ruleConditions(userGroupIndex);
    for (let j = 0; j < conditions.length; j++) {
      const condition = conditions.at(j);
      const entity = condition?.get("entity")?.value;
      const selections = condition?.get("selections")?.value || [];
      
      if (entity === NsAccessControlConfig.SelectionType.Service && selections.length > 0) {
        // Check raw selections
        if (selections.some((s: string) => isAllIndiaService(s))) {
          return true;
        }
        
        // Also check through service mapping
        const serviceNames = this.cadreMappingService.getServicesByNames(selections);
        if (serviceNames.some((service) => isAllIndiaService(service.name))) {
          return true;
        }
      }
    }
    return false;
  }

  onEntityChange(userGroupIndex: number, conditionIndex: number): void {
    const conditions = this.ruleConditions(userGroupIndex);
    const condition = conditions.at(conditionIndex);
    const selectedEntity = condition?.get("entity")?.value;
    const previousEntity = condition?.value?.entity;

    // Check if we need to show confirmation dialog before making changes
    const shouldShowConfirmation = this.shouldShowEntityChangeConfirmation(userGroupIndex, conditionIndex);

    if (shouldShowConfirmation) {
      const dialogRef = this.dialog.open(ConfirmDialogComponent, {
        width: "470px",
        data: { type: "confirm-reset-fields" }
      });

      dialogRef.afterClosed().subscribe(result => {
        if (result?.action === NsAccessControlConfig.IActions.Confirm) {
          this.processEntityChange(userGroupIndex, conditionIndex, selectedEntity, previousEntity);
        } else {
          // Reset the dropdown to previous value if user cancels
          condition?.get("entity")?.setValue(previousEntity);
        }
      });
    } else {
      this.processEntityChange(userGroupIndex, conditionIndex, selectedEntity, previousEntity);
    }
  }

  private shouldShowEntityChangeConfirmation(userGroupIndex: number, conditionIndex: number): boolean {
    // Check if this is a content that's not live or if it's MDO application or has contentId
    if (!(this.content?.status === "Live" || this.content?.prevStatus === "Live" || this.content?.status === "Review") || this.config.application === this.MDO_APPLICATION || this.content?.contentId) {
      const conditions = this.ruleConditions(userGroupIndex);
      const condition = conditions.at(conditionIndex);
      
      if (this.content?.accessSetting === NsAccessControlConfig.IAccessSetting.ALL_USERS) {
        // Use the same logic as checkForResetFilter to determine if we should show confirmation
        const conditionValue = condition?.getRawValue();
        const ruleValue = this.userGroup.at(userGroupIndex).getRawValue();
        return this.checkForResetFilter(conditionValue, ruleValue, userGroupIndex);
      } else if (this.config.application === this.MDO_APPLICATION || this.content?.contentId) {
        // For MDO applications, check if the user group is in initial state
        const currentGroup = this.userGroup.at(userGroupIndex);
        const isInInitialState = (() => {
          if (this.config?.mdoContent?.status === 'Live' || this.content?.status === 'live') {
            const initialUserGroups = this.getInitialState();
            if (initialUserGroups) {
              return initialUserGroups.some(group => group.userGroupName === currentGroup.get('name')?.value);
            }
          }
          return false;
        })();

        // Only show confirmation if not in initial state
        if (!isInInitialState) {
          const conditionValue = condition?.getRawValue();
          const ruleValue = this.userGroup.at(userGroupIndex).getRawValue();
          return this.checkForResetFilter(conditionValue, ruleValue, userGroupIndex);
        }
      }
    }
    return false;
  }

  private processEntityChange(userGroupIndex: number, conditionIndex: number, selectedEntity: string, previousEntity: string): void {
    const conditions = this.ruleConditions(userGroupIndex);
    const condition = conditions.at(conditionIndex);

    if (condition?.value?.selections?.length) {
      condition.get("selections")?.setValue([]);
      this.processDisableAddConditionOnClose(userGroupIndex);
      this.calculateUserCountForUserGroup(userGroupIndex, conditionIndex);
    }

    // If entity type changed from Service to something else, clear Central Deputation conditions
    if (previousEntity === NsAccessControlConfig.SelectionType.Service && selectedEntity !== NsAccessControlConfig.SelectionType.Service) {
      // Remove all Central Deputation conditions after this index in this user group
      for (let i = conditions.length - 1; i >= conditionIndex + 1; i--) {
        const cond = conditions.at(i);
        if (cond?.get("entity")?.value === NsAccessControlConfig.SelectionType.CentralDeputation) {
          conditions.removeAt(i);
        }
      }
      
      // Check if any other user group still has AIS
      const hasAIS = this.hasAllIndiaServicesInAnyGroup();
      if (!hasAIS) {
        this.accessControlService.enableDeputation(false);
      }
    }

    // Reset subsequent conditions if needed (similar to resetActiveUserGroupFields)
    if (this.shouldResetSubsequentConditions(userGroupIndex, conditionIndex)) {
      this.resetActiveUserGroupFieldsByIndex(userGroupIndex, conditionIndex);
    }
  }

  private shouldResetSubsequentConditions(userGroupIndex: number, conditionIndex: number): boolean {
    const accessControlFormData = this.accessControlForm.getRawValue();
    const activeManageSelection = accessControlFormData && accessControlFormData?.userGroup?.[userGroupIndex];
    
    if (activeManageSelection && activeManageSelection?.conditions && activeManageSelection?.conditions?.length > 1) {
      // Check if there are subsequent conditions with selections that need to be reset
      for (let i = conditionIndex + 1; i < activeManageSelection.conditions.length; i++) {
        if (activeManageSelection.conditions[i]?.selections?.length > 0) {
          return true;
        }
      }
    }
    return false;
  }

  onOpeningEntityChange(event: boolean, userGroupIndex: number, conditionIndex: number): void {
    if (event) {
      // Disable cadre from selection if services/batch has not cadre
      const conditions = this.ruleConditions(userGroupIndex);
      let selectedService: string[] = [];
      let selectedBatch: number[] = [];
      for (let i = 0; i < conditions.length; i++) {
        const entity = conditions.at(i).get("entity")?.value;
        const selections = conditions.at(i).get("selections")?.value || [];
        if (entity === NsAccessControlConfig.SelectionType.Service) {
          selectedService = selections;
        }
        if (entity === NsAccessControlConfig.SelectionType.Batch) {
          selectedBatch = selections;
        }
      }

      let availableCadres: any[] = [];
      let disableCadre = false;

      // 1. Only service is added
      if (selectedService.length) {
        const serviceSelections = this.cadreMappingService.getServiceIdsByName(selectedService || []) || [];
        availableCadres = this.cadreMappingService.getCadresByServices(serviceSelections);
        disableCadre = availableCadres.length === 0;
      } else {
        // If neither is selected, do not disable Cadre
        if(this.content) {
          if (this.content.accessSetting === NsAccessControlConfig.IAccessSetting.MDO_SPECIFIC) disableCadre = true;
          else disableCadre = false;
        }
      }

      // Check if Central Deputation should be available (only if All India Services exists in THIS user group)
      const hasAISInThisGroup = this.hasAllIndiaServicesInUserGroup(userGroupIndex);
      const disableCentralDeputation = !hasAISInThisGroup;

      const updatedOptions = this.accessControlCriteriaSelection.optionsEntity.map(option => {
        if (option.value === NsAccessControlConfig.SelectionType.Cadre) {
          return { ...option, disabled: disableCadre };
        }
        if (option.value === NsAccessControlConfig.SelectionType.CentralDeputation) {
          return { ...option, disabled: disableCentralDeputation };
        }
        return option;
      });
      this.accessControlCriteriaSelection.optionsEntity = [...updatedOptions];
    }
  }

  getAvailableEntities(userGroupIndex: number, currentConditionIndex: number): any[] {
    const conditions = this.ruleConditions(userGroupIndex);
    const selectedEntities = conditions.controls
      .map((ctrl, idx) => (idx !== currentConditionIndex ? ctrl.get("entity")?.value : null))
      .filter(e => !!e);
    return this.accessControlCriteriaSelection?.optionsEntity.filter(option => !selectedEntities.includes(option.value));
  }

  getDeleteType(): string {
    const { courseCategory, status, prevStatus } = this.content || {};
    const mdoStatus = this.mdoContent?.status;

    const isComprehensiveAssessment = courseCategory === 'Comprehensive Assessment Program';
    const isLiveStatus = status === 'Live' || prevStatus === 'Live' || mdoStatus === 'Live';

    if (isComprehensiveAssessment && isLiveStatus) {
      return 'delete-live';
    }

    return 'delete';
  }

  removeUserGroup(index: number) {
    const type = this.getDeleteType();

    const group = this.userGroup.at(index);
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: "470px",
      data: { additionalData: group?.value?.name, type: type }
    });
    dialogRef.afterClosed().subscribe(result => {
      if (result?.action === NsAccessControlConfig.IActions.Confirm) {
        if (group?.value?.conditions?.length && group?.value?.conditions[0]?.selections.length) {
          this.userGroup.removeAt(index);
          // Rename remaining groups
          for (let i = 0; i < this.userGroup.length; i++) {
            this.resetUserGroup(i);
          }
          this.reindexUserCount();
          
          // Check if any remaining user group has AIS
          const hasAIS = this.hasAllIndiaServicesInAnyGroup();
          if (!hasAIS) {
            this.accessControlService.enableDeputation(false);
          }
          
          this.applyAccessControlValue(true);
          this.calculateUserCountForUserGroup(index);
        } else {
          this.userGroup.removeAt(index);
          // Rename remaining groups
          for (let i = 0; i < this.userGroup.length; i++) {
            this.resetUserGroup(i);
          }
          this.reindexUserCount();
          
          // Check if any remaining user group has AIS
          const hasAIS = this.hasAllIndiaServicesInAnyGroup();
          if (!hasAIS) {
            this.accessControlService.enableDeputation(false);
          }

        }
      }
    });
  }

  private reindexUserCount() {
    const newUserCount: { [key: number]: number } = {};
    for (let i = 0; i < this.userGroup.length; i++) {
      newUserCount[i] = this.userCount[i] || 0;
    }
    this.userCount = newUserCount;
  }

  resetUserGroup(index: number) {
    const group = this.userGroup.at(index);
    if (group) {
      const groupName = group?.value?.name
      if(this.config.application === this.MDO_APPLICATION) {
        group.get("name")?.setValue(group?.value?.name);
      } else {
        group.get("name")?.setValue(`User Group ${index + 1}`);
      }
    } 
  }

  resetUserGroupWithSelections(userGroupIndex: number) {
    const group = this.userGroup.at(userGroupIndex);
    if (group) {
      group.get("name")?.setValue(`User Group ${userGroupIndex + 1}`);
      const conditions = group.get("conditions") as FormArray;
      if (conditions && conditions.length) {
        for (let i = 0; i < conditions.length; i++) {
          const condition = conditions.at(i);
          condition.get("entity")?.setValue("");
          condition.get("selections")?.setValue([]);
        }
      }
      this.calculateUserCountForUserGroup(userGroupIndex);
      this.processDisableAddConditionOnClose(userGroupIndex);
    }
  }


  checkServicesAndResetReleated(userGroupIndex: number, conditionIndex: number): void {
    const userGroups = this.userGroup.at(userGroupIndex);
    const conditions = this.ruleConditions(userGroupIndex);
    if (userGroups) {
      const conditionsUserGroup = userGroups?.value?.conditions || [];

      // Find service index
      const serviceIndex = _.findIndex(conditionsUserGroup, (c: any) => c.entity === NsAccessControlConfig.SelectionType.Service);
      const condition = conditions.at(conditionIndex);
      if (serviceIndex !== -1 && condition?.get("entity")?.value === NsAccessControlConfig.SelectionType.Service) {
        conditionsUserGroup.forEach((c: any, index: number) => {
          if (_.includes([NsAccessControlConfig.SelectionType.CentralDeputation], c.entity) && index > serviceIndex) {
             conditions.setControl(index, this.createConditionGroup(uuidv4(), userGroupIndex));
             this.accessControlService.enableDeputation(false)
          }
        });
       if (this.accessControlCriteriaSelection?.optionsEntity?.filter(ele => ele.value === NsAccessControlConfig.SelectionType.CentralDeputation)?.length) {
        this.accessControlService.enableDeputation(false)
       }
      }
    }
  }

  removeCondition(userGroupIndex: number, conditionIndex: number) {
    const type = this.getDeleteType();
    const conditions = this.ruleConditions(userGroupIndex);
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: "470px",
      data: { additionalData: "this condition", type: type }
    });
    dialogRef.afterClosed().subscribe(result => {
      if (result?.action === NsAccessControlConfig.IActions.Confirm) {
        this.checkServicesAndResetReleated(userGroupIndex, conditionIndex);
        conditions.removeAt(conditionIndex);
        this.applyAccessControlValue(true);
        this.calculateUserCountForUserGroup(userGroupIndex);
        this.processDisableAddConditionOnClose(userGroupIndex);
      }
    });
  }

  resetCondition(userGroupIndex: number, conditionIndex: number) {
    const conditions = this.ruleConditions(userGroupIndex);
    const condition = conditions.at(conditionIndex);
    if (condition) {
      const wasServiceCondition = condition.get("entity")?.value === NsAccessControlConfig.SelectionType.Service;
      
      this.checkServicesAndResetReleated(userGroupIndex, conditionIndex);

      const id = condition.get("id")?.value || uuidv4();
      conditions.setControl(conditionIndex, this.createConditionGroup(id, userGroupIndex));

      // If it was a service condition, check if any user group still has AIS
      if (wasServiceCondition) {
        const hasAIS = this.hasAllIndiaServicesInAnyGroup();
        if (!hasAIS) {
          this.accessControlService.enableDeputation(false);
        }
      }

      this.calculateUserCountForUserGroup(userGroupIndex, conditionIndex);
      this.processDisableAddConditionOnClose(userGroupIndex);

      if (this.config.application === this.MDO_APPLICATION) {
        this.applyAccessControlValue(true, false)
      }
    }
  }

  checkIfAnyConditionContainsDisabledMessage(userGroupIndex: number): boolean {
    return this.userGroup.at(userGroupIndex).get("conditions")?.value.some((condition: any) => condition.disabledMessage);
  }

  manageSelections(conditionForm: any, ruleForm: any, userGroupIndex: number, activeTabSelected = 0): void {
    const condition = conditionForm.getRawValue();
    const rule = ruleForm.getRawValue();
    let resetFilterFlag = false;
    if (!(this.content?.status === "Live" || this.content?.prevStatus === "Live" || this.content?.status === "Review") || this.config.application === this.MDO_APPLICATION || this.content?.contentId) {
      if (this.content?.accessSetting === NsAccessControlConfig.IAccessSetting.ALL_USERS) {
        resetFilterFlag = this.checkForResetFilter(condition, rule, userGroupIndex);
      } else if (this.config.application === this.MDO_APPLICATION || this.content?.contentId) {
        // For MDO applications, check if the user group is in initial state
        const currentGroup = this.userGroup.at(userGroupIndex);
        const isInInitialState = (() => {
          if (this.config?.mdoContent?.status === 'Live' || this.content?.status === 'live') {
            const initialUserGroups = this.getInitialState();
            if (initialUserGroups) {
              return initialUserGroups.some(group => group.userGroupName === currentGroup.get('name')?.value);
            }
          }
          return false;
        })();

        // Only show reset filter flag if not in initial state and if any condition contains disabled message then dont show the warning
        if (!isInInitialState) {
          if (this.checkIfAnyConditionContainsDisabledMessage(userGroupIndex)) {
            resetFilterFlag = false;
          } else {
            resetFilterFlag = this.checkForResetFilter(condition, rule, userGroupIndex);
          }
        }
      }
      
      if (resetFilterFlag) {
        const dialogRef = this.dialog.open(ConfirmDialogComponent, {
          width: "470px",
          data: { type: "confirm-reset-fields" }
        });

        dialogRef.afterClosed().subscribe(result => {
          if (result?.action === NsAccessControlConfig.IActions.Confirm) {
            this.resetActiveUserGroupFields(condition, rule, userGroupIndex);
          }
        });
      }
    }

    switch (condition.entity) {
      case NsAccessControlConfig.SelectionType.Users:
        if (!resetFilterFlag) {
          this.openInviteUserDialog(condition, rule, activeTabSelected, rule?.isUserGroupDisabled);
        }
        break;
      case NsAccessControlConfig.SelectionType.Organizations:
      case NsAccessControlConfig.SelectionType.Designation:
      case NsAccessControlConfig.SelectionType.Service:
      case NsAccessControlConfig.SelectionType.Cadre:
      case NsAccessControlConfig.SelectionType.Batch:
      case NsAccessControlConfig.SelectionType.Group:
      case NsAccessControlConfig.SelectionType.VerificationStatus:
        this.processCadreConfigMapping(userGroupIndex);
        if (!resetFilterFlag) {
          this.openSelectionDialog(rule, condition, activeTabSelected, rule?.isUserGroupDisabled);
        }
        break;
      default:
        if (!resetFilterFlag) {
          this.openSelectionDialog(rule, condition, activeTabSelected, rule?.isUserGroupDisabled);
        }
    }
  }

  openSelectionDialog(rule: any, condition: any, activeTabSelected: number, isDisabled: boolean): void {
    const originalSelections = [...(condition.selections || [])];

    const dialogRef = this.dialog.open(EntitySelectionsComponent, {
      width: "1032px",
      maxHeight: "95vh",
      data: { rule: rule, condition: condition, selected: condition.selections, activeTabSelected: activeTabSelected, disabled: isDisabled }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        // Find the rule FormGroup in the FormArray
        const ruleIndex = this.userGroup.controls.findIndex((ctrl: any) => ctrl.get("id")?.value === result.rule.id);
        if (ruleIndex !== -1) {
          const ruleGroup = this.userGroup.at(ruleIndex);
          const conditions = ruleGroup.get("conditions") as FormArray;
          const conditionIndex = conditions.controls.findIndex((ctrl: any) => ctrl.get("id")?.value === result.condition.id);

          if (conditionIndex !== -1) {
            const conditionGroup = conditions.at(conditionIndex);
            conditionGroup.get("selections")?.setValue(result.selected);

            if (
              condition.entity === NsAccessControlConfig.SelectionType.Organizations &&
              !this.areSelectionsEqual(originalSelections, result.selected)
            ) {
              const designationCondition = conditions.controls.find(
                ctrl => ctrl.get("entity")?.value === NsAccessControlConfig.SelectionType.Designation
              );

              if (designationCondition) {
                designationCondition.get("selections")?.setValue([]);
              }
            }

            // Enable Deputation if Service is selected 'All India Services'
            if (condition.entity === NsAccessControlConfig.SelectionType.Service) {
              this.checkServicesAndResetReleated(ruleIndex, conditionIndex);
              
              const isAllIndiaService = (serviceName: string): boolean => {
                if (!serviceName) return false;
                const lower = serviceName.toLowerCase();
                return lower.includes("all india service") ||
                       lower.includes("indian administrative service") ||
                       lower.includes("(ias)") ||
                       lower.includes("indian police service") ||
                       lower.includes("(ips)") ||
                       lower.includes("indian forest service") ||
                       lower.includes("(ifs)");
              };
              
              const hasAIS = result.selected.some((s: string) => isAllIndiaService(s));
              if (hasAIS) {
                this.accessControlService.enableDeputation(true);
              } else {
                this.accessControlService.enableDeputation(false);
              }
            }
            this.processCadreConfigMapping(ruleIndex);
            this.processDisableAddConditionOnClose(ruleIndex);

            if (!this.areSelectionsEqual(originalSelections, result.selected)) {
              this.calculateUserCountForUserGroup(ruleIndex);
            }

            // send event after every selection for MDO
            if (this.config.application === this.MDO_APPLICATION) {
              this.applyAccessControlValue(true, false);
            }
          }
        }
      }
    });
  }

  private areSelectionsEqual(content_1: any[], content_2: any[]): boolean {
    if (content_1.length !== content_2.length) return false;
    return content_1.every(item => content_2.includes(item));
  }

  processCadreConfigMapping(userGroupIndex: number): void {
    const ruleGroup = this.userGroup.at(userGroupIndex);
    const conditionValue = ruleGroup.get("conditions")?.value;
    if (conditionValue && conditionValue.length) {
      const services = conditionValue.find((ele: any) => ele.entity === NsAccessControlConfig.SelectionType.Service);
      const cadre = conditionValue.find((ele: any) => ele.entity === NsAccessControlConfig.SelectionType.Cadre);
      const batch = conditionValue.find((ele: any) => ele.entity === NsAccessControlConfig.SelectionType.Batch);

      const serviceSelections = this.cadreMappingService.getServiceIdsByName(services?.selections || []) || [];
      const cadreSelections = this.cadreMappingService.getCadreIdsByName(cadre?.selections || []) || [];
      const batchSelections = batch?.selections || [];

      // Case 1: Only service selected
      if (serviceSelections?.length && !cadreSelections?.length && !batchSelections?.length) {
        this.accessControlService.holdServiceCadrebatch.update(prev => ({
          ...prev,
          service: this.cadreMappingService.getAllServices(),
          cadre: this.cadreMappingService.getCadresByServices(serviceSelections),
          batch: this.cadreMappingService.getBatchYearsByServices(serviceSelections)
        }));
      }
      // Case 2: Only cadre selected
      else if (!serviceSelections?.length && cadreSelections?.length && !batchSelections?.length) {
        this.accessControlService.holdServiceCadrebatch.update(prev => ({
          ...prev,
          cadre: this.cadreMappingService.getAllCadres(),
          service: this.cadreMappingService.getServicesByCadres(cadreSelections),
          batch: this.cadreMappingService.getBatchYearsByCadres(cadreSelections)
        }));
      }
      // Case 3: Only batch selected
      else if (!serviceSelections?.length && !cadreSelections?.length && batchSelections?.length) {
        this.accessControlService.holdServiceCadrebatch.update(prev => ({
          ...prev,
          batch: this.cadreMappingService.getAllBatchYears(),
          service: this.cadreMappingService.getServicesByBatchYears(batchSelections),
          cadre: this.cadreMappingService.getCadresByBatchYears(batchSelections)
        }));
      }
      // Case 4: Service and Cadre selected
      else if (serviceSelections?.length && cadreSelections?.length && !batchSelections?.length) {
        this.accessControlService.holdServiceCadrebatch.update(prev => ({
          ...prev,
          service: this.cadreMappingService.getServicesByCadres(cadreSelections),
          cadre: this.cadreMappingService.getCadresByServices(serviceSelections),
          batch: this.cadreMappingService.getBatchYearsByServicesAndCadres(serviceSelections, cadreSelections)
        }));
      }
      // Case 5: Service and Batch selected
      else if (serviceSelections?.length && !cadreSelections?.length && batchSelections?.length) {
        this.accessControlService.holdServiceCadrebatch.update(prev => ({
          ...prev,
          cadre: this.cadreMappingService.getCadresByServicesAndBatch(serviceSelections, batchSelections),
          service: this.cadreMappingService.getServicesByBatchYears(batchSelections),
          batch: this.cadreMappingService.getBatchYearsByServices(serviceSelections)
        }));
      }
      // Case 6: Cadre and Batch selected
      else if (!serviceSelections?.length && cadreSelections?.length && batchSelections?.length) {
        this.accessControlService.holdServiceCadrebatch.update(prev => ({
          ...prev,
          service: this.cadreMappingService.getServicesByCadresAndBatch(cadreSelections, batchSelections),
          cadre: this.cadreMappingService.getCadresByBatchYears(batchSelections),
          batch: this.cadreMappingService.getBatchYearsByCadres(cadreSelections)
        }));
      } else {
        this.accessControlService.holdServiceCadrebatch.set({
          service: this.cadreMappingService.getAllServices(),
          batch: this.cadreMappingService.getAllBatchYears(),
          cadre: this.cadreMappingService.getAllCadres()
        });
      }
    }
  }

  processDisableAddConditionOnClose(userGroupIndex: number): void {
    // If any condition is Users and at least one user is added, disable add condition
    const ruleGroup = this.userGroup.at(userGroupIndex);
    const conditions = ruleGroup.get("conditions") as FormArray;
    const hasUsersConditionWithSelection = conditions.controls.some(
      ctrl =>
        ctrl.get("entity")?.value === NsAccessControlConfig.SelectionType.Users &&
        Array.isArray(ctrl.get("selections")?.value) &&
        ctrl.get("selections")?.value.length > 0
    );
    ruleGroup.get("isAddConditionDisabled")?.setValue(hasUsersConditionWithSelection);
  }

  openInviteUserDialog(condition: any, rule: any, activeTabSelected: number, isDisabled: boolean): void {
    const originalSelections = [...(condition.selections || [])];

    const dialogRef = this.dialog.open(InviteUsersComponent, {
      width: "1090px",
      data: { condition: condition, rule: rule, selected: condition.selections, activeTab: activeTabSelected, disabled: isDisabled }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        // Find the rule FormGroup in the FormArray
        const ruleIndex = this.userGroup.controls.findIndex((ctrl: any) => ctrl.get("id")?.value === result.rule.id);
        if (ruleIndex !== -1) {
          const ruleGroup = this.userGroup.at(ruleIndex);
          const conditions = ruleGroup.get("conditions") as FormArray;
          const conditionIndex = conditions.controls.findIndex((ctrl: any) => ctrl.get("id")?.value === result.condition.id);
          if (conditionIndex !== -1) {
            const conditionGroup = conditions.at(conditionIndex);
            // const userIds = result.selected && result.selected.map((user: any) => user?.userId);
            conditionGroup.get("selections")?.setValue(result.selected);
            this.processDisableAddConditionOnClose(ruleIndex);
          }

          // send event after every selection for MDO
         if (this.config.application === this.MDO_APPLICATION) {
              this.applyAccessControlValue(true, false);
        }

          if (!this.areSelectionsEqual(originalSelections, result.selected)) {
            this.calculateUserCountForUserGroup(ruleIndex);
          }
        }
      }
    });
  }

  callSnackbar(message: string, type: "success" | "error"): void {
    if (type === "success") {
      this.snackbar.openFromComponent(SnackbarComponent, {
        data: { message: message, type: "success" },
        duration: 3000,
        panelClass: "course-success-snackbar"
      });
    } else if (type === "error") {
      this.snackbar.openFromComponent(SnackbarComponent, {
        data: { message: message, type: "error" },
        duration: 3000,
        panelClass: "course-error-snackbar"
      });
    }
  }

  validateFormData() {
    // Validate user groups and conditions
    if (!this.userGroup || this.userGroup.length === 0) {
      this.callSnackbar("Please add at least one user group.", "error");
      return false;
    }
    for (let i = 0; i < this.userGroup.length; i++) {
      const group = this.userGroup.at(i);
      const conditions = group.get("conditions") as FormArray;
      if (!conditions || conditions.length === 0) {
        this.callSnackbar(`User group ${i + 1} must have at least one condition.`, "error");
        return false;
      }
      for (let j = 0; j < conditions.length; j++) {
        const selections = conditions.at(j).get("selections")?.value;
        if (!selections || selections.length === 0) {
          this.callSnackbar(`Condition ${j + 1} in user group ${i + 1} must have at least one selection.`, "error");
          return false;
        }
      }
    }
    return true;
  }

  async applyAccessControlValue(shouldProceedWithoutValidation: boolean = false, displaySuccessMessage: boolean = true): Promise<void> {
    if (!shouldProceedWithoutValidation) {
      const validated = this.validateFormData();
      if (!validated) return;
    }

    this.isSaving = true;

    const payload = await this.processRequestCreation();

    if (this.config.application === this.MDO_APPLICATION) {
      this.accessControlData.emit({ userGroup: payload, accessType: this.accessType });
      if (displaySuccessMessage) this.callSnackbar("Access Control saved successfully", "success");
      this.isSaveFltrBtnDisabled = true;
      this.isSaving = false;

      if(this.userGroup.length === 0) {
        this.isAddUserGroupBtnDisabled = false
      }
      return;
    }

    this.accessControlService
      .applyUserGroupAccessControl(payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: response => {
          if (response?.result && response?.result?.accessControl) {
            this.accessControlData.emit({ userGroup: response.result.accessControl?.userGroups, accessType: this.accessType });
            if (displaySuccessMessage) this.callSnackbar("Access Control saved successfully", "success");
            this.initialUserGroupValue = JSON.stringify(this.accessControlForm.getRawValue().userGroup);
            this.isSaveFltrBtnDisabled = true;

            // Update secure setting for moderated content
            if (this.content?.status !== "Live" && this.content?.prevStatus !== "Live" && !this.isCuratedContentWithExternalId) {
              this.updateContentAccessSetting();
            }

            // Remove initialstate for saved content for Marketplace external content on live status 
            if(this.content?.status === 'live' && this.isCuratedContentWithExternalId) {
              localStorage.removeItem(`${NsAccessControlConfig.Application.Creation_Portal}_access_control_${this.contentId}`)
            }
          } else {
            this.callSnackbar("Could not save access control, Please try again.", "error");
          }
          this.isSaving = false
        },
        error: () => {
          this.callSnackbar("Could not save access control, Please try again.", "error");
          this.isSaving = false
        }
      });
  }

  /**
   * Selections shown for a saved ministryOrStateId criteria, i.e every organisation of the logged in
   * L0 MDO hierarchy. Falls back to the stored ministry / state id when the hierarchy is not
   * available for the logged in user (a non L0 MDO opening the content).
   */
  private getMinistryOrStateSelections(criteriaValue: any): string[] {
    // The L0 that saved it reopens it as its "Select all" option
    if (!this.isCCA && this.canSelectOrgHierarchy && this.accessControlService.isL0MdoUser(this.config)) {
      return [ALL_ORGANISATIONS_SELECTION];
    }
    const hierarchyOrgIds = this.accessControlService.getOrgHierarchyOrgIds();
    if (hierarchyOrgIds.length) {
      return hierarchyOrgIds;
    }
    return Array.isArray(criteriaValue) ? criteriaValue : [criteriaValue];
  }

  /**
   * Organisation criteria of a user group. A L0 MDO selecting every organisation of its hierarchy
   * is stored as the ministry / state itself, one id standing for all of them.
   *
   * Only the L0 is stored that way. An organisation below it selecting everything it can see has
   * selected its own branch, and no single id names a branch - collapsing it would store the one
   * organisation the user is in, which is the opposite of what was selected. It keeps the explicit
   * rootOrgId list, as every partial selection does.
   */
  private createOrganisationCriteria(selections: string[]): { criteriaKey: string; criteriaValue: string[] } {
    const isL0 = this.accessControlService.isL0MdoUser(this.config);
    // "Select all" on MDO: a L0 saves its own ministry / state, a L1 -> L10 every organisation of
    // its branch from the org hierarchy framework, a CCA an empty rootOrgId list
    if (this.isAllOrganisationsSelection(selections)) {
      const ministryOrStateId = this.accessControlService.getLoggedInOrgId(this.config);
      if (!this.isCCA && isL0 && this.canSelectOrgHierarchy && ministryOrStateId) {
        return { criteriaKey: MINISTRY_OR_STATE_CRITERIA_KEY, criteriaValue: [ministryOrStateId] };
      }
      if (!this.isCCA && this.canSelectOrgHierarchy) {
        return { criteriaKey: NsAccessControlConfig.SelectionType.Organizations, criteriaValue: this.accessControlService.getOrgHierarchyOrgIds() };
      }
      return { criteriaKey: NsAccessControlConfig.SelectionType.Organizations, criteriaValue: [] };
    }
    if (isL0 && this.canSelectOrgHierarchy && this.accessControlService.areAllOrgHierarchyOrgsSelected(selections)) {
      const ministryOrStateId = this.accessControlService.getLoggedInOrgId(this.config);
      if (ministryOrStateId) {
        return { criteriaKey: MINISTRY_OR_STATE_CRITERIA_KEY, criteriaValue: [ministryOrStateId] };
      }
    }
    return { criteriaKey: NsAccessControlConfig.SelectionType.Organizations, criteriaValue: selections };
  }

  /** A saved rootOrgId list naming every organisation of the branch of a L1 -> L10, i.e its "Select all". */
  private isSavedBranchSelectAll(criteriaKey: string, criteriaValue: any): boolean {
    return (
      !this.isCCA &&
      this.canSelectOrgHierarchy &&
      criteriaKey === NsAccessControlConfig.SelectionType.Organizations &&
      Array.isArray(criteriaValue) &&
      criteriaValue.length > 0 &&
      !this.accessControlService.isL0MdoUser(this.config) &&
      this.accessControlService.areAllOrgHierarchyOrgsSelected(criteriaValue)
    );
  }

  /** Organisation condition selections holding the MDO "Select all" option. */
  isAllOrganisationsSelection(selections: any): boolean {
    return (
      this.config?.application === this.MDO_APPLICATION &&
      Array.isArray(selections) &&
      selections.includes(ALL_ORGANISATIONS_SELECTION)
    );
  }

  /**
   * A saved rootOrgId criteria with no organisation in it is the MDO "Select all" option. It is saved
   * as an empty list, a value that comes back without the list at all is read the same way.
   */
  private isSavedAllOrganisationsCriteria(criteriaKey: string, criteriaValue: any): boolean {
    return (
      this.config?.application === this.MDO_APPLICATION &&
      criteriaKey === NsAccessControlConfig.SelectionType.Organizations &&
      (criteriaValue === null || criteriaValue === undefined || (Array.isArray(criteriaValue) && criteriaValue.length === 0))
    );
  }

  /**
   * The own organisation is appended to every group of a non CCA MDO, which is what scopes a group
   * that names no organisation of its own to the organisation the user works in.
   *
   * A group that already names one is left as it was selected. It is one organisation criteria or
   * the other, never both: `ministryOrStateId` and `rootOrgId` sent together are two organisation
   * scopes for the same group, and the narrower of the two throws the wider one away.
   */
  private appendOwnOrganisationCriteria(criteriaList: any[]): void {
    if (this.isCCA) {
      return;
    }

    const criteria = criteriaList || [];

    // The whole ministry / state is the widest organisation scope there is, and nothing is added
    // beside it. This holds whoever is saving, not only while the hierarchy could be read.
    const namesMinistryOrState = criteria.some(
      (entry: any) => entry?.criteriaKey === MINISTRY_OR_STATE_CRITERIA_KEY
    );
    if (namesMinistryOrState) {
      return;
    }

    // A group that already names organisations is scoped by them, wherever they came from - picked
    // out of the org hierarchy, or set on the content itself. The own organisation on top of them
    // is the same id twice, or an organisation the selected ones do not contain, matching nobody.
    const namesOrganisations = criteria.some(
      (entry: any) => entry?.criteriaKey === NsAccessControlConfig.SelectionType.Organizations
    );
    if (namesOrganisations) {
      return;
    }

    criteria.push({
      criteriaKey: NsAccessControlConfig.SelectionType.Organizations,
      criteriaValue: [this.config?.userConfig?.rootOrgId || ""]
    });
  }

  private processRequestCreationV2(group: any): any {
    return {
      userGroupId: this.config?.application === NsAccessControlConfig.Application.MDO
        ? (group.savedUserGroupId || "")
        : (group.id || uuidv4()),
      userGroupName: group.name,
      userGroupCriteriaList: group.conditions.map((condition: any) => {
        let criteriaValue: string[];
        if (
          condition?.entity === NsAccessControlConfig.SelectionType.Users &&
          condition?.selections?.length &&
          condition?.selections[0]?.userId
        ) {
          const userIds = condition.selections?.map((user: any) => user?.userId) || [];
          criteriaValue = userIds;
        } else if (condition?.entity === NsAccessControlConfig.SelectionType.CentralDeputation) {
          criteriaValue = condition.selections[0];
          return { criteriaKey: condition.entity, criteriaValue };

        } else {
          if (condition.selections.length && typeof condition.selections[0] === "object") {
            criteriaValue = condition.selections?.map((sel: any) => sel?.fieldValue) || [];
          } else {
            criteriaValue = condition.selections?.map(String) || [];
          }
        }

        if (condition.entity && criteriaValue && criteriaValue.length > 0) {
          if (condition.entity === NsAccessControlConfig.SelectionType.Organizations) {
            return this.createOrganisationCriteria(criteriaValue);
          }
          return {
            criteriaKey: condition.entity,
            criteriaValue,
          };
        }
        return null;
      })
      .filter((criteria: any) => !!criteria), // Remove nulls
    };
  }

  processRequestCreation(): Promise<IUserGroupRequest> {
    return new Promise((resolve, reject) => {
      try {
        const data = this.accessControlForm.getRawValue();

        // Filter out user groups with empty userGroupCriteriaList
        const userGroups = data.userGroup
          .map((group: any) => ({
            // MDO reports only an id the api issued, so a group that has never been saved reports
            // none rather than a uuid minted here that would read as a saved group. Every other
            // application keeps the id it has always sent
            userGroupId: this.config?.application === NsAccessControlConfig.Application.MDO
              ? (group.savedUserGroupId || "")
              : (group.id || uuidv4()),
            userGroupName: group.name,
            userGroupCriteriaList: group.conditions.map((condition: any) => {
              let criteriaValue: string[];
              if (
                condition?.entity === NsAccessControlConfig.SelectionType.Users &&
                condition?.selections?.length &&
                condition?.selections[0]?.userId
              ) {
                const userIds = condition.selections?.map((user: any) => user?.userId) || [];
                criteriaValue = userIds;
              } else if (condition?.entity === NsAccessControlConfig.SelectionType.CentralDeputation) {
                criteriaValue = condition.selections[0];
                return { criteriaKey: condition.entity, criteriaValue };

              } else {
                if (condition.selections.length && typeof condition.selections[0] === "object") {
                  criteriaValue = condition.selections?.map((sel: any) => sel?.fieldValue) || [];
                } else {
                  criteriaValue = condition.selections?.map(String) || [];
                }
              }

              if (condition.entity && criteriaValue && criteriaValue.length > 0) {
                if (condition.entity === NsAccessControlConfig.SelectionType.Organizations) {
                  return this.createOrganisationCriteria(criteriaValue);
                }
                return {
                  criteriaKey: condition.entity,
                  criteriaValue,
                };
              }
              return null;
            })
            .filter((criteria: any) => !!criteria), // Remove nulls
        }))
        .filter((group: any) => Array.isArray(group.userGroupCriteriaList) && group.userGroupCriteriaList.length > 0);

      const requestPayload: IUserGroupRequest = {
        contentId: this.contentId,
        accessControl: {
          version: 1,
          userGroups,
        },
      };

      requestPayload.accessControl.userGroups.forEach((group: any) => {
        this.appendOwnOrganisationCriteria(group.userGroupCriteriaList);
      });

      resolve(requestPayload);
    } catch (error) {
      reject(error);
    }
  })
}


  openInstructonsDialog(): void {
    this.dialog.open(AccessControlGuideComponent, {
      width: "960px"
    });
  }

  async getAccessControl(): Promise<void> {
    const response = await this.accessControlService
      .fetchUserGroupAccessControl(this.contentId)
      .pipe(takeUntil(this.destroy$))
      .toPromise()
      .catch(() => {
        // For Moderated Content Condition if not already added the usergroup autocreate a usergroup with added conditions and save it
        const isComprehensiveCategory = this.content?.courseCategory === "Comprehensive Assessment Program"
        if (this.content?.accessSetting === NsAccessControlConfig.IAccessSetting.MDO_SPECIFIC || isComprehensiveCategory) {
          // Create Organization condition
          const orgCondition = this.createConditionGroup(uuidv4(), 0);
          orgCondition.get("entity")?.setValue(NsAccessControlConfig.SelectionType.Organizations);
          orgCondition.get("selections")?.setValue([this.config?.userConfig?.rootOrgId]);
          
          // For Comprehensive Assessment Program, disable the organization field
      if (isComprehensiveCategory) {
            orgCondition.get("entity")?.disable();
            orgCondition.get("selections")?.disable();
          }

          // Create user group with conditions based on category
          const conditions = [orgCondition];
          // Only add Verification Status condition if NOT Comprehensive Assessment Program
          if (!isComprehensiveCategory) {
            const verificationCondition = this.createConditionGroup(uuidv4(), 0);
            verificationCondition.get("entity")?.setValue(NsAccessControlConfig.SelectionType.VerificationStatus);
            verificationCondition.get("selections")?.setValue(["VERIFIED"]);
            conditions.push(verificationCondition);
          }
// Create user group with these two conditions
          const group = this.fb.group({
            id: [uuidv4()],
            name: ["User Group 1"],
            description: ["Description for UserGroup 1"],
            conditions: this.fb.array(conditions),
            // isUserGroupDisabled: [isComprehensiveCategory], // Disable user group for comprehensive
            // After discussing the Vikas and Arjun disabled goup should be enable, user can select and deselect the org, delete buttons should be available
            // isAddConditionDisabled: [isComprehensiveCategory] // Disable adding conditions for comprehensive
          });
          this.userGroup.push(group);

          // Disable add user group btn
          this.isAddUserGroupBtnDisabled = true;
          this.accessControlData.emit({ userGroup: this.accessControlForm.value?.userGroup, accessType: this.accessType });
          this.applyAccessControlValue(false, false);
          this.updateContentAccessSetting();
        }
        
//  if (this.content && this.content?.courseCategory === "Comprehensive Assessment Program") {
//           this.addUserGroup();
//         }   

        // For a content not having any user group disable the access control type change
        if (
        (this.content?.status === "Live" || this.content?.prevStatus === "Live") && 
        // this.content?.accessSetting !== NsAccessControlConfig.IAccessSetting.MDO_SPECIFIC &&
        (!this.isCuratedContentWithExternalId)
        ) {
        this.accessControlCriteriaSelection?.accessTypes.forEach((type) => {
            type.disabled = true;
        });
        this.isSaveFltrBtnDisabled = true;
      }
        setTimeout(() => {
          this.initialUserGroupValue = JSON.stringify(this.accessControlForm.getRawValue().userGroup);
          this.setupFormChangeDetection();
        }, 0);
      });
    if (response?.result?.accessControl) {
      this.processAccessControlResult(response.result.accessControl);
      this.accessControlData.emit({ userGroup: response.result.accessControl?.userGroups, accessType: this.accessType });

    }
  }

  private setupFormChangeDetection(): void {
    this.accessControlForm.valueChanges.subscribe(() => {
      const currentValue = JSON.stringify(this.accessControlForm.getRawValue().userGroup);
      if (this.content?.status === "Live" || this.content?.prevStatus === "Live") {
        this.isSaveFltrBtnDisabled = currentValue === this.initialUserGroupValue;

        if(this.content?.accessSetting !== NsAccessControlConfig.IAccessSetting.MDO_SPECIFIC) {
          this.isAddUserGroupBtnDisabled = currentValue === this.initialUserGroupValue;
        }
      } else {
        this.isSaveFltrBtnDisabled = currentValue === this.initialUserGroupValue;
      }
    });
  }

  processAccessControlResult(accessControl: any): void {
    if (!accessControl?.userGroups?.length) {
      setTimeout(() => {
        this.initialUserGroupValue = JSON.stringify(this.accessControlForm.getRawValue().userGroup);
        this.setupFormChangeDetection();
      }, 0);

      return;
    }

    while (this.userGroup.length) {
      this.userGroup.removeAt(0);
    }

    // Save initial state if not already saved for live content
    if (!this.getInitialState()) {
      this.saveInitialState(accessControl?.userGroups);
    }

    // Check if ANY user group has All India Services BEFORE processing
    const isAllIndiaService = (serviceName: string): boolean => {
      if (!serviceName) return false;
      const lower = serviceName.toLowerCase();
      return lower.includes("all india service") ||
             lower.includes("indian administrative service") ||
             lower.includes("(ias)") ||
             lower.includes("indian police service") ||
             lower.includes("(ips)") ||
             lower.includes("indian forest service") ||
             lower.includes("(ifs)");
    };
    
    let hasAISInAnyGroup = false;
    accessControl.userGroups.forEach((group: any) => {
      const isContainsService = group.userGroupCriteriaList.find((criteria: any) => criteria.criteriaKey === NsAccessControlConfig.SelectionType.Service);
      if (isContainsService?.criteriaKey === NsAccessControlConfig.SelectionType.Service) {
        const criteriaValues = isContainsService.criteriaValue || [];
        // Check if any service is an All India Service
        if (criteriaValues.some((val: string) => isAllIndiaService(val))) {
          hasAISInAnyGroup = true;
        }
      }
    });
    
    // Enable/disable deputation based on whether ANY group has AIS
    if (hasAISInAnyGroup) {
      this.accessControlService.enableDeputation(true);
    } else {
      this.accessControlService.enableDeputation(false);
    }

    accessControl.userGroups.forEach((group: any, index: number) => {
      const conditions = this.fb.array([]) as any;

      group.userGroupCriteriaList.forEach((criteria: any) => {
        const condition = this.createConditionGroup(uuidv4(), this.userGroup.length);

        // Map API keys to form entity values
        const entityMap: { [key: string]: string } = {
          rootOrgId: NsAccessControlConfig.SelectionType.Organizations,
          user: NsAccessControlConfig.SelectionType.Users,
          group: NsAccessControlConfig.SelectionType.Group,
          designation: NsAccessControlConfig.SelectionType.Designation,
          profilestatus: NsAccessControlConfig.SelectionType.VerificationStatus,
          Cadre: NsAccessControlConfig.SelectionType.Cadre,
          service: NsAccessControlConfig.SelectionType.Service,
          batch: NsAccessControlConfig.SelectionType.Batch,
          isOnCentralDeputation: NsAccessControlConfig.SelectionType.CentralDeputation,
          [MINISTRY_OR_STATE_CRITERIA_KEY]: NsAccessControlConfig.SelectionType.Organizations
        };

        // Set the form values
        condition.patchValue({
          entity: entityMap[criteria.criteriaKey] || criteria.criteriaKey,
          selections:
            criteria.criteriaKey === MINISTRY_OR_STATE_CRITERIA_KEY
              ? this.getMinistryOrStateSelections(criteria.criteriaValue)
              : criteria.criteriaKey === NsAccessControlConfig.SelectionType.Batch
                ? Array.isArray(criteria.criteriaValue)
                  ? criteria.criteriaValue.map((b: any) => Number(b))
                  : []
                : criteria.criteriaKey === NsAccessControlConfig.SelectionType.CentralDeputation
                ? Array.isArray(criteria.criteriaValue)
                  ? criteria.criteriaValue
                  : [criteria.criteriaValue]
                : criteria.criteriaValue,
        });

        conditions.push(condition);
      });

      const ruleGroup = this.fb.group({
        id: [group.userGroupId || uuidv4()],
        name: [group.userGroupName],
        description: [`Description for ${group.userGroupName}`],
        conditions: conditions,
        isUserGroupDisabled: [false],
        isAddConditionDisabled: [false]
      });

      this.userGroup.push(ruleGroup);

      // Check if add condition should be disabled for this user group
      this.processDisableAddConditionOnClose(index);

      // Calculate count for each user group
      this.calculateUserCountForUserGroup(index);
      if (
        (this.content?.status === "Live" || this.content?.prevStatus === "Live") && 
        this.content?.courseCategory !== "Comprehensive Assessment Program" &&
        // this.content?.accessSetting !== NsAccessControlConfig.IAccessSetting.MDO_SPECIFIC && 
        (!this.isCuratedContentWithExternalId)
      ) {
        // publisher (cannot edit already added)
        for (let i = 0; i < this.userGroup?.length; i++) {
          const group = this.userGroup.at(i);
          group.get("id")?.disable();
          group.get("name")?.disable();
          group.get("description")?.disable();
          group.get("conditions")?.disable();
          group.get("isUserGroupDisabled")?.setValue(true);
        }
        this.accessControlCriteriaSelection?.accessTypes.forEach((type) => {
            type.disabled = true;
        });
        this.isSaveFltrBtnDisabled = true;
      }

      // For Comprehensive Assessment Program - ALLOW all operations (removed disable logic)
   // Users can modify organizations, delete user groups, etc.
      const isComprehensiveCategory = this.content?.courseCategory === "Comprehensive Assessment Program";
    if (isComprehensiveCategory) {
        // Disable organization entity dropdown and selections in all conditions
        for (let i = 0; i < this.userGroup?.length; i++) {
          const group = this.userGroup.at(i);
          const conditions = group.get("conditions") as FormArray;
          
          for (let j = 0; j < conditions.length; j++) {
            const condition = conditions.at(j);
            // If this is an Organizations condition, disable it
           if (condition.get("entity")?.value === NsAccessControlConfig.SelectionType.Organizations) {
              condition.get("entity")?.disable();
              condition.get("selections")?.disable();
            }
          }
          
          // Disable user group editing controls
          group.get("id")?.disable();
          group.get("name")?.disable();
          group.get("description")?.disable();
           // After discussing with Vikas and Arjun, disabled group should be enabled, user can select and deselect the org, delete buttons should be available
          group.get("isUserGroupDisabled")?.setValue(false);
          group.get("isAddConditionDisabled")?.setValue(false);
        }
        // Disable access type changes
        this.accessControlCriteriaSelection?.accessTypes.forEach((type) => {
            type.disabled = true;
        });
        this.isSaveFltrBtnDisabled = true;
      }

      // For marketplace curated content with external id, disable only those user groups which were in live
       if (this.content?.status === "live" && this.isCuratedContentWithExternalId) {
          // Get initial state from localStorage
          const initialUserGroups = this.getInitialState();

          if (initialUserGroups) {
            // Only disable user groups that were in the initial state
            const initialGroupIds = initialUserGroups.map(group => group.userGroupName);

            for (let i = 0; i < this.userGroup.length; i++) {
              const group = this.userGroup.at(i);
              const groupId = group.get("name")?.value;

              // If this group was in the initial state, disable it
              if (initialGroupIds.includes(groupId)) {
                group.get("id")?.disable();
                group.get("name")?.disable();
                group.get("description")?.disable();
                group.get("conditions")?.disable();
                group.get("isUserGroupDisabled")?.setValue(true);
              }
            }
          }

          this.isSaveFltrBtnDisabled = true;
        }

      setTimeout(() => {
        this.initialUserGroupValue = JSON.stringify(this.accessControlForm.getRawValue().userGroup);
        this.setupFormChangeDetection();
      }, 0);
    });
  }

  async updateContentAccessSetting(): Promise<void> {
    let secureSettings = {};
    if (typeof this.content.language === "string") {
      this.content.language = [this.content.language];
    }
    if (this.content.accessSetting === NsAccessControlConfig.IAccessSetting.MDO_SPECIFIC) {
      const userGroup0 = this.userGroup.at(0);
      let organisation: string[] = [];
      let isVerifiedKarmayogi = "";

      if (userGroup0) {
        const conditions = userGroup0.get("conditions") as FormArray;
        if (conditions && conditions.length) {
          const orgCondition = conditions.controls.find(ctrl => ctrl.get("entity")?.value === NsAccessControlConfig.SelectionType.Organizations);
          if (orgCondition) {
            organisation = orgCondition.get("selections")?.value || [];
          }

          const verificationCondition = conditions.controls.find(
            ctrl => ctrl.get("entity")?.value === NsAccessControlConfig.SelectionType.VerificationStatus
          );
          if (verificationCondition) {
            const verSelections = verificationCondition.get("selections")?.value || [];
            isVerifiedKarmayogi = Array.isArray(verSelections) && verSelections?.length > 1 ? "No" : "Yes";
          }
        }
      }

      this.content.secureSettings = {
        version: 1,
        organisation,
        isVerifiedKarmayogi
      };
      secureSettings = {
        version: 1,
        organisation,
        isVerifiedKarmayogi
      };
    }

    const accessTypeBoolean = this.accessType === NsAccessControlConfig.IAccessTypes.Public ? false : true;
    const request = this.accessControlService.createRequestContent(this.content, accessTypeBoolean);
    const requestForMDO = this.accessControlService.createRequesForMDOContent(this.content, accessTypeBoolean, secureSettings);
    if (this.content.status !== "Live" || this.content.prevStatus != "Live") {
      if (
        (this.config.userConfig.userRoles.has("content_publisher") || this.config.userConfig.userRoles.has("spv_publisher")) &&
        this.content.status !== "Draft"
      ) {
        if (this.content.accessSetting === NsAccessControlConfig.IAccessSetting.MDO_SPECIFIC) {
          if (this.content.reviewStatus) {
            (requestForMDO.request.content as any).reviewStatus = this.content.reviewStatus;
          }
          await this.accessControlService.updateContentV4(requestForMDO, this.contentId).toPromise();
        } else {
          if (this.content.reviewStatus) {
            (request.request.content as any).reviewStatus = this.content.reviewStatus;
          }
          await this.accessControlService.updateContentV4(request, this.contentId).toPromise();
        }
      } else {
        if (this.content.accessSetting === NsAccessControlConfig.IAccessSetting.MDO_SPECIFIC) {
          await this.accessControlService.updateContentV3(requestForMDO, this.contentId).toPromise();
        } else {
          await this.accessControlService.updateContentV3(request, this.contentId).toPromise();
        }
      }
    }

    this.refreshContentMeta.emit(true);
  }

  get hasUserGroupBeenAdded(): boolean {
    if (!this.userGroup?.length) {
      return true;
    }

    return !this.userGroup.controls.every((group: any) => {
      const conditions = (group.get("conditions") as FormArray)?.controls || [];
      return (
        conditions?.length > 0 &&
        conditions.every((condition: any) => {
          const selections = condition.get("selections")?.value;
          return Array.isArray(selections) && selections.length > 0;
        })
      );
    });
  }

  get getTotalUserCount(): number {
    return (Object.values(this.userCount) as number[]).reduce((total, count) => total + count, 0);
  }

  processConditionsForContentType(): void {
    if (this.content?.accessSetting === NsAccessControlConfig.IAccessSetting.MDO_SPECIFIC) {
      // Disable add user group btn
      this.isAddUserGroupBtnDisabled = true;
    }

    if (this.content?.status === "Review" && this.content?.reviewStatus === "InReview") {
      // reviewer(readonly)
      this.accessControlCriteriaSelection.readOnly = true;
      this.isSaveFltrBtnDisabled = true;
    }
    //  else if (
    //   (this.content?.status === "Live" || this.content?.prevStatus === "Live") &&
    //   this.content?.courseCategory !== "Comprehensive Assessment Program" &&
    //   (this.config.userConfig.userRoles.has("spv_publisher") || this.config.userConfig.userRoles.has("content_publisher")) &&
    //   !this.config.userConfig.userRoles.has("content_creator")
    // ) {
    //   // publisher (disabled all)
    //   this.accessControlCriteriaSelection.readOnly = true;
    //   this.isSaveFltrBtnDisabled = true;
    // }
  }

  async calculateUserCountForUserGroup(userGroupIndex: number, conditionIndex?: number): Promise<void> {
    // Mapping of entity to request key
    const entityKeyMap: { [key: string]: string } = {
      [NsAccessControlConfig.SelectionType.Organizations]: "rootOrgId",
      [NsAccessControlConfig.SelectionType.Designation]: "profileDetails.professionalDetails.designation",
      [NsAccessControlConfig.SelectionType.Group]: "profileDetails.professionalDetails.group",
      [NsAccessControlConfig.SelectionType.VerificationStatus]: "profileDetails.profileStatus",
      [NsAccessControlConfig.SelectionType.Cadre]: "profileDetails.cadreDetails.cadreName",
      [NsAccessControlConfig.SelectionType.Service]: "profileDetails.cadreDetails.civilServiceName",
      [NsAccessControlConfig.SelectionType.Batch]: "profileDetails.cadreDetails.cadreBatch",
      [NsAccessControlConfig.SelectionType.Users]: "identifier",
      [NsAccessControlConfig.SelectionType.CentralDeputation]: "profileDetails.cadreDetails.isOnCentralDeputation"
    };

    const group = this.userGroup.at(userGroupIndex);
    if (!group) {
      this.userCount[userGroupIndex] = 0;
      return;
    }

    const conditions = group.get("conditions") as FormArray;
    const request: { [key: string]: any } = {};
    let hasAllOrganisations = false;

    for (let j = 0; j < conditions.length; j++) {
      const condition = conditions.at(j);
      const entity = condition.get("entity")?.value;
      const selections = condition.get("selections")?.value || [];
      const key = entityKeyMap[entity];
      // A L0 MDO selecting every organisation of its hierarchy is saved as its ministry / state,
      // the count reads the same scope instead of the expanded rootOrgId list
      if (entity === NsAccessControlConfig.SelectionType.Organizations) {
        const organisationCriteria = this.createOrganisationCriteria(selections);
        if (organisationCriteria.criteriaKey === MINISTRY_OR_STATE_CRITERIA_KEY) {
          request[MINISTRY_OR_STATE_FILTER_KEY] = organisationCriteria.criteriaValue;
          continue;
        }
      }
      if (key) {
        if (
          entity === NsAccessControlConfig.SelectionType.Users &&
          Array.isArray(selections) &&
          selections.every(sel => typeof sel === "object" && sel !== null)
        ) {
          const userIds = selections && selections.map((user: any) => user?.userId);
          request[key] = userIds;
        } else if (entity === NsAccessControlConfig.SelectionType.CentralDeputation) {
          // A saved group reopened for edit can hold the flag as a string ("true"/"false")
          const centralDeputation = Array.isArray(selections) ? selections[0] : selections;
          if (typeof centralDeputation === "boolean") {
            request[key] = centralDeputation;
          } else if (centralDeputation === "true" || centralDeputation === "false") {
            request[key] = centralDeputation === "true";
          }
        }
        else if (this.isAllOrganisationsSelection(selections)) {
          hasAllOrganisations = true;
          // Every organisation: a CCA counts across all of them, any other MDO across the
          // organisations of its hierarchy, which are the ones it could have picked
          request[key] = this.isCCA ? [] : this.accessControlService.getOrgHierarchyOrgIds();
        }
        else {
          request[key] = selections;
        }
      } 
      // A condition with no entity picked yet, or nothing selected, is not a custom field filter
      else if (entity && Array.isArray(selections) && selections.length) {
        if (!request.orgCustomFields) {
          request.orgCustomFields = {};
        }
          const customFieldSelections = selections.map((sel: any) => sel?.fieldValue || sel);
          request.orgCustomFields[`${entity}`] = customFieldSelections;
        }
    }

    // Remove keys with empty array values
    Object.keys(request).forEach(key => {
      if (Array.isArray(request[key]) && request[key].length === 0) {
        delete request[key];
      }
    });
    
    if (this.accessControlService.accessControlConfig()?.application === NsAccessControlConfig.Application.MDO) {
      if (!this.isCCA && Object.keys(request)?.length > 0) {
        // A L0 MDO can scope the count to the organisations picked from its hierarchy,
        // for every other non CCA MDO the count is always restricted to its own organisation
        const hasOrgSelections = this.canSelectOrgHierarchy && request.rootOrgId?.length > 0;
        // The ministry / state already scopes the count, a rootOrgId beside it would narrow it to one organisation
        const hasMinistryOrState = request[MINISTRY_OR_STATE_FILTER_KEY]?.length > 0;
        if (!hasOrgSelections && !hasMinistryOrState) {
          request.rootOrgId = this.accessControlService.accessControlConfig().userConfig.org?.rootOrgId ? [this.accessControlService.accessControlConfig().userConfig.org?.rootOrgId] : [];
        }
      }
    }

    const filters: any = { ...request };
    // Every organisation picked by a CCA leaves no filter, the count is still read across all of them
    if (Object.keys(filters).length > 0 || hasAllOrganisations) {
      filters.status = 1;
    } else {
      delete filters.status;
    }

    const payload = {
      request: {
        ...(Object.keys(filters).length > 0 ? { filters } : {}),
        fields: ["identifier", "rootOrgId", "firstName"]
      }
    };
    if(payload?.request?.filters) {
      const response = await this.accessControlService
        .validateUser(payload)
        .toPromise()
        .catch(() => {
          this.userCount[userGroupIndex] = 0;
        });
      if (response?.result?.response) {
        const count = response?.result?.response?.count;
        this.userCount[userGroupIndex] = count;
        if (!this.userCount[userGroupIndex]) {
          this.callSnackbar("No iGOT official match the set conditions selections, please review the set conditions and their respective selections.", "error")
        }
      }
    } else {
      this.userCount[userGroupIndex] = 0;
    }
  }

  isUserGroupFormChanged(initialValue: any): boolean {
    const currentValue = this.accessControlForm.getRawValue().userGroup;
    return JSON.stringify(currentValue) !== JSON.stringify(initialValue);
  }

  checkForResetFilter(condition: any, rule: any, userGroupIndex: any) {
    let flag = false;
    let accessControlFormData = this.accessControlForm.getRawValue();
    let activeManageSelection = accessControlFormData && accessControlFormData?.userGroup?.[userGroupIndex];
    let activeSelectionCount = 0;
    if (activeManageSelection && activeManageSelection?.conditions && activeManageSelection?.conditions?.length > 1) {
      //Show Popup
      let onlyOneCondition = this.hasOnlyOneArrayWithLength(activeManageSelection?.conditions, "selections");
      if (onlyOneCondition) {
        flag = false;
      } else {
        activeManageSelection?.conditions?.map((item: any) => {
          if (item?.entity == condition?.entity && item?.selections.length > 0) {
            flag = true;
          }
        });
      }
      if (activeManageSelection?.conditions?.length > 1) {
        let checkLastIndexHaveSelections = -1;
        activeManageSelection?.conditions?.forEach((item: any, index: number) => {
          if (item?.selections.length > 0) {
            checkLastIndexHaveSelections = index;
          }
        });
        
        if (activeManageSelection?.conditions[checkLastIndexHaveSelections]?.entity === condition?.entity && condition?.selections?.length > 0) {
          flag = false;
        }
      }
    }
    return flag;
  }

  hasOnlyOneArrayWithLength(data: any, key: any) {
    let count = 0;
    for (const obj of data) {
      if (Array.isArray(obj[key]) && obj[key].length > 0) {
        count++;
      }
    }
    return count > 1 ? false : true;
  }

  resetActiveUserGroupFields(condition: any, rule: any, userGroupIndex: any) {
    let accessControlFormData = this.accessControlForm.getRawValue();
    let activeManageSelection = accessControlFormData && accessControlFormData?.userGroup?.[userGroupIndex];
    let activeConditionIndex = activeManageSelection?.conditions?.findIndex((item: any) => {
      return item?.entity === condition?.entity && item?.selections?.length > 0;
    });
    let activeManageSelectionArrLength = activeManageSelection?.conditions.length;
    for (let i = activeConditionIndex + 1; i < activeManageSelectionArrLength; i++) {
      const userGroupArray = this.accessControlForm.get("userGroup") as FormArray;
      const userGroup = userGroupArray.at(userGroupIndex) as FormGroup;
      const conditionsArray = userGroup.get("conditions") as FormArray;
      const conditionGroup = conditionsArray.at(i) as FormGroup;
      // conditionGroup.reset();
      const condition = conditionGroup;
      condition.get("entity")?.setValue("");
      condition.get("selections")?.setValue([]);
    }

    this.calculateUserCountForUserGroup(userGroupIndex);
  }

  resetActiveUserGroupFieldsByIndex(userGroupIndex: number, conditionIndex: number) {
    const userGroupArray = this.accessControlForm.get("userGroup") as FormArray;
    const userGroup = userGroupArray.at(userGroupIndex) as FormGroup;
    const conditionsArray = userGroup.get("conditions") as FormArray;
    const conditionsLength = conditionsArray.length;
    
    // Reset all conditions after the current condition index
    for (let i = conditionIndex + 1; i < conditionsLength; i++) {
      const conditionGroup = conditionsArray.at(i) as FormGroup;
      conditionGroup.get("entity")?.setValue("");
      conditionGroup.get("selections")?.setValue([]);
    }

    this.calculateUserCountForUserGroup(userGroupIndex);
  }

  // Customs Field Logics
  async getCustomsField(): Promise<void> {
    this.isLoading = true;

    try {
      const data: any = await this.accessControlService
        .fetchCustomsField({
          organisationId: this.config.userConfig.rootOrgId,
          isEnabled: true,
          type: "masterList",
          isMandatory: true
        })

      if (data?.result?.searchResults?.data?.length) {
        const results = data.result.searchResults.data;

        const mappedFields = _.chain(results)
          .map(field => {
            if (field?.originalCustomFieldData?.length === 1) {
              const firstField = _.first(field.originalCustomFieldData) as {
                attributeName?: string;
                name?: string;
              };

              const filteredAndUniqueData = _.chain(field?.reversedOrderCustomFieldData)
                .filter((item: any) => item?.fieldAttribute === firstField?.attributeName)
                .uniqBy("fieldValue")
                .value();

              return {
                disabled: false,
                value: firstField?.name || "",
                label: firstField?.name || "",
                isCustomField: true,
                reversedOrderCustomFieldData: filteredAndUniqueData
              };
            }

            if (field?.originalCustomFieldData?.length > 1) {
              const lastField = _.last(field.originalCustomFieldData) as {
                attributeName?: string;
                name?: string;
              };

              if (!lastField) return null;

              const filteredAndUniqueData = _.chain(field?.reversedOrderCustomFieldData)
                .filter((item: any) => item?.fieldAttribute === lastField?.attributeName)
                .uniqBy("fieldValue")
                .value();

              return {
                disabled: false,
                value: lastField?.name || "",
                label: lastField?.name || "",
                isCustomField: true,
                reversedOrderCustomFieldData: filteredAndUniqueData
              };
            }

            return null;
          })
          .compact()
          .value();

        // Update the service with mapped fields
        this.accessControlService.customesFieldData.set(mappedFields);

        // Update optionsEntity without duplicates
        this.accessControlCriteriaSelection.optionsEntity = _.uniqBy(
          [...this.accessControlCriteriaSelection.optionsEntity, ...mappedFields],
          "value"
        );

        // Create dynamic fields
        const dynamicFields = mappedFields.reduce((acc, field) => {
          acc[field.value] = [
            { value: "all", label: `All ${field.label}` },
            { value: "selected", label: `Selected ${field.label}` }
          ];
          return acc;
        }, {} as Record<string, Array<{ value: string; label: string }>>);

        // Merge configurations
        this.accessControlCriteriaSelection = {
          ...this.accessControlCriteriaSelection,
          ...dynamicFields
        };

        // Update signal
        this.accessControlService.accessControlConfig.update(prev => ({
          ...prev,
          accessControlCriteriaSelection: this.accessControlCriteriaSelection
        }));
        
      }
    } catch (error) {} finally {
      this.isLoading = false;
    }
  }


  // Patch raw accesscontrol to form
  private getStorageKey(): string {
    return `${this.config.application}_access_control_${this.contentId}`;
  }

  private saveInitialState(userGroups: any[]): void {
    if ((this.config?.application === this.MDO_APPLICATION && this.config?.mdoContent?.status === "Live") || 
    (this.content?.status === "live" && this.isCuratedContentWithExternalId)) {
      const state = {
        initialUserGroups: userGroups,
        timestamp: new Date().getTime()
      };
      localStorage.setItem(this.getStorageKey(), JSON.stringify(state));
    }
  }

  private getInitialState(): any[] | null {
    const savedState = localStorage.getItem(this.getStorageKey());
    if (savedState) {
      const { initialUserGroups } = JSON.parse(savedState);
      return initialUserGroups;
    }
    return null;
  }

  processTempAccessControl(tempAccessControl: any): void {
    while (this.userGroup.length) {
      this.userGroup.removeAt(0);
    }

    // If no user groups in the data, add a default one
    if (!tempAccessControl?.userGroups || tempAccessControl.userGroups.length === 0) {
      this.addUserGroup();
      setTimeout(() => {
        this.initialUserGroupValue = JSON.stringify(this.accessControlForm.getRawValue().userGroup);
        this.setupFormChangeDetection();
      }, 0);
      return;
    }

    // Save initial state if not already saved for live content
    if (!this.getInitialState()) {
      this.saveInitialState(tempAccessControl.userGroups);
    }

    // Check if ANY user group has All India Services BEFORE processing
    const isAllIndiaService = (serviceName: string): boolean => {
      if (!serviceName) return false;
      const lower = serviceName.toLowerCase();
      return lower.includes("all india service") ||
             lower.includes("indian administrative service") ||
             lower.includes("(ias)") ||
             lower.includes("indian police service") ||
             lower.includes("(ips)") ||
             lower.includes("indian forest service") ||
             lower.includes("(ifs)");
    };
    
    let hasAISInAnyGroup = false;
    if (this.config?.application === NsAccessControlConfig.Application.MDO) {
      tempAccessControl.userGroups.forEach((group: any) => {
        const isContainsService = group.userGroupCriteriaList.find((criteria: any) => criteria.criteriaKey === NsAccessControlConfig.SelectionType.Service);
        if (isContainsService?.criteriaKey === NsAccessControlConfig.SelectionType.Service) {
          const criteriaValues = isContainsService.criteriaValue || [];
          // Check if any service is an All India Service
          if (criteriaValues.some((val: string) => isAllIndiaService(val))) {
            hasAISInAnyGroup = true;
          }
        }
      });
      
      // Enable/disable deputation based on whether ANY group has AIS
      if (hasAISInAnyGroup) {
        this.accessControlService.enableDeputation(true);
      } else {
        this.accessControlService.enableDeputation(false);
      }
    }

    tempAccessControl.userGroups.forEach((group: any, index: number) => {
      // Process patching.
      const conditions = this.fb.array([]) as any;

      group.userGroupCriteriaList.forEach(async (criteria: any) => {

        const isOrganisationCriteria =
          criteria.criteriaKey === NsAccessControlConfig.SelectionType.Organizations ||
          criteria.criteriaKey === MINISTRY_OR_STATE_CRITERIA_KEY;

        if(!this.isCCA && !this.canSelectOrgHierarchy && isOrganisationCriteria) {
          return; // Skip this iteration to not add the organization condition
        }

        let isCustomFieldCrieteriaKeyPresent = false
        const condition = this.createConditionGroup(uuidv4(), this.userGroup.length);

        if (
          this.isSavedAllOrganisationsCriteria(criteria.criteriaKey, criteria.criteriaValue) ||
          this.isSavedBranchSelectAll(criteria.criteriaKey, criteria.criteriaValue)
        ) {
          condition.patchValue({
            entity: NsAccessControlConfig.SelectionType.Organizations,
            selections: [ALL_ORGANISATIONS_SELECTION],
          });
          conditions.push(condition);
          return;
        }

        // Whole ministry / state was saved, show every organisation of the hierarchy as selected
        if (criteria.criteriaKey === MINISTRY_OR_STATE_CRITERIA_KEY) {
          condition.patchValue({
            entity: NsAccessControlConfig.SelectionType.Organizations,
            selections: this.getMinistryOrStateSelections(criteria.criteriaValue),
          });
          conditions.push(condition);
          return;
        }

        // Set the form values
          const { criteriaKey, criteriaValue } = criteria;
          let selections: any;

          if (criteriaKey === NsAccessControlConfig.SelectionType.Batch) {
            selections = Array.isArray(criteriaValue) ? criteriaValue.map((b: any) => Number(b)) : [];
          } 
          else if (criteriaKey === NsAccessControlConfig.SelectionType.CentralDeputation) {
            selections = Array.isArray(criteriaValue) ? criteriaValue : [criteriaValue];
          } 
          else {
            const configOptions = this.accessControlCriteriaSelection.optionsEntity;
            const isPresent = configOptions.some((field: any) => field.value === criteriaKey);

            if (!isPresent && this.config.accessControlCriteriaSelection.allowCustomsField) {
              isCustomFieldCrieteriaKeyPresent = !isPresent;
              selections = criteriaValue;
              
              const dynamicFieldEntry: Record<string, Array<{ value: string; label: string }>> = {
                [criteriaKey]: [
                  { value: "all", label: `All ${criteriaKey}` },
                  { value: "selected", label: `Selected ${criteriaKey}` }
                ]
              };

              const newOptionEntity = { disabled: false, value: criteriaKey, label: criteriaKey, isCustomField: true };

              this.accessControlCriteriaSelection.optionsEntity = _.uniqBy(
                [...this.accessControlCriteriaSelection.optionsEntity, newOptionEntity],
                'value'
              );

              this.accessControlCriteriaSelection = { ...this.accessControlCriteriaSelection, ...dynamicFieldEntry };
              this.accessControlService.accessControlConfig.update(prevConfig => ({
                ...prevConfig,
                accessControlCriteriaSelection: this.accessControlCriteriaSelection
              }));
            } else {
              selections = criteriaValue;
            }
          }

          if(isCustomFieldCrieteriaKeyPresent) {
            if(!this.isCCA) {
              condition.patchValue(
                { entity: criteriaKey, selections: selections, disabledMessage: "This condition is disabled because it is either disabled or removed from the custom field" }
              );
            } else if(this.isCCA && this.mdoContent?.status?.toLowerCase() === "draft") return 
          } else {
            condition.patchValue({ entity: criteriaKey, selections });
          }
          conditions.push(condition);
        });

        const ruleGroup = this.fb.group({
          id: [group.userGroupId || uuidv4()],
          // The id the api issued for this group, empty for one that has never been saved. Kept
          // apart from `id`, which is only what this component tracks groups by
          savedUserGroupId: [group.userGroupId || ""],
          name: [group.userGroupName],
          description: [`Description for ${group.userGroupName}`],
          conditions: conditions,
          isUserGroupDisabled: [false],
          isAddConditionDisabled: [false],
        });

        this.userGroup.push(ruleGroup);
        this.markUserGroupConditionsSaved(this.userGroup.length - 1);

     //   if (
      //   (this.mdoContent?.status === "Live") &&
      //   (this.config.userConfig.userRoles.has("mdo_admin") || this.config.userConfig.userRoles.has("mdo_leader"))
      // ) {
      //   // Get initial state from localStorage
      //   const initialUserGroups = this.getInitialState();
        
      //   if (initialUserGroups) {
      //     // Only disable user groups that were in the initial state
      //     const initialGroupIds = initialUserGroups.map(group => group.userGroupName);
          
      //     for (let i = 0; i < this.userGroup.length; i++) {
      //       const group = this.userGroup.at(i);
      //       const groupId = group.get("name")?.value;
            
      //       // If this group was in the initial state, disable it
      //       if (initialGroupIds.includes(groupId)) {
      //         group.get("id")?.disable();
      //         group.get("name")?.disable();
      //         group.get("description")?.disable();
      //         group.get("conditions")?.disable();
      //         group.get("isUserGroupDisabled")?.setValue(true);
      //       }
      //     }
      //   }
        
      //   this.isSaveFltrBtnDisabled = true;
      // }
      
        // Check if add condition should be disabled for this user group
        this.processDisableAddConditionOnClose(index);

        // Calculate count for each user group
        this.calculateUserCountForUserGroup(index);

        // For NON-CCA to CCA send event so it can be updated correctly on update api 
        this.applyAccessControlValue(true, false);
    });

    setTimeout(() => {
      this.initialUserGroupValue = JSON.stringify(this.accessControlForm.getRawValue().userGroup);
      this.setupFormChangeDetection();
    }, 0);
  }

  get canAddUserGroup(): boolean {
    if (this.isLoading) {
      return false;
    }

    if (!this.userGroup?.length) {
      return true;
    }

    if (this.config?.application !== this.MDO_APPLICATION) {
      return true;
    }

    // For MDO applications with Live status
    if (this.config?.application === this.MDO_APPLICATION && this.config?.mdoContent?.status === "Live") {
      // const initialUserGroups = this.getInitialState();
      // if (!initialUserGroups) {
      //   return true;
      // }

      // // Get current non-disabled user groups
      // const activeUserGroups = this.userGroup.controls.filter(group => 
      //   !group.get('isUserGroupDisabled')?.value
      // );

      // if (activeUserGroups.length === 0) {
      //   return true;
      // }

      // return false;
      return true
    }

    if(this.config.context.type === 'training-plan' && this.config?.application === this.MDO_APPLICATION) {
      return true
    }

    return false;
  }

  get isCuratedContentWithExternalId(): boolean {    
    return !!(this.content && this.content.externalId);
  }

  saveAccessSettings(): void {
    const isLiveContent = this.content?.status === "Live" || this.content?.prevStatus === "Live" || this.content?.status === "live";
    const isMdoLiveContent = this.config?.application === this.MDO_APPLICATION && this.config?.mdoContent?.status === "Live";
    const isCuratedLiveWithExternalId = this.content?.status === "live" && this.isCuratedContentWithExternalId;

    if (isLiveContent || isMdoLiveContent || isCuratedLiveWithExternalId) {
      const dialogRef = this.dialog.open(ConfirmDialogComponent, {
        width: "520px",
        data: { type: "confirm-apply-accesscontrol-for-live", }
      });

      dialogRef.afterClosed().subscribe((result: any) => {
        if (result?.action === "confirm") {
          this.applyAccessControlValue(true, true);
        }
      });
    } else {
      this.applyAccessControlValue(true, true);
    }
  }

  isUserGroupSaved(userGroupIndex: number): boolean {
    return !!this.savedUserGroupIdAt(userGroupIndex);
  }

  private savedUserGroupIdAt(userGroupIndex: number): string {
    return this.userGroup?.at(userGroupIndex)?.get("savedUserGroupId")?.value || "";
  }

  /** A saved group whose conditions are the same as when it was last saved, nothing to update. */
  isSavedUserGroupUnchanged(userGroupIndex: number): boolean {
    const savedUserGroupId = this.savedUserGroupIdAt(userGroupIndex);
    return !!savedUserGroupId &&
      this.savedUserGroupConditions.get(savedUserGroupId) === this.userGroupConditionsValue(userGroupIndex);
  }

  private userGroupConditionsValue(userGroupIndex: number): string {
    const conditions = this.userGroup?.at(userGroupIndex)?.get("conditions")?.getRawValue() || [];
    return JSON.stringify(conditions.map((condition: any) => ({
      entity: condition?.entity,
      selections: condition?.selections
    })));
  }

  private markUserGroupConditionsSaved(userGroupIndex: number): void {
    const savedUserGroupId = this.savedUserGroupIdAt(userGroupIndex);
    if (savedUserGroupId) {
      this.savedUserGroupConditions.set(savedUserGroupId, this.userGroupConditionsValue(userGroupIndex));
    }
  }

  saveReusableUserGroups(userGroupIndex: number = 0): void {
    const rawGroup = this.accessControlForm.getRawValue()?.userGroup?.[userGroupIndex];
    if (!rawGroup) {
      return;
    }
    const savedUserGroupId = this.savedUserGroupIdAt(userGroupIndex);

    if (!savedUserGroupId) {
      this.openSaveUserGroupDialog(rawGroup, userGroupIndex, savedUserGroupId);
      return;
    }

    if(this.mdoContent?.status?.toLowerCase() === 'live') {
      const confirmDialogRef = this.dialog.open(ConfirmDialogComponent, {
        width: "470px",
        data: { type: "confirm-update-reusable-group" }
      });
  
      confirmDialogRef.afterClosed().subscribe(result => {
        if (result?.action === NsAccessControlConfig.IActions.Confirm) {
          this.openSaveUserGroupDialog(rawGroup, userGroupIndex, savedUserGroupId);
        }
      });
    } else {
      this.openSaveUserGroupDialog(rawGroup, userGroupIndex, savedUserGroupId);
    }
  }

  /** Asks for the group name, then saves the group as a new reusable group or updates the saved one. */
  private openSaveUserGroupDialog(rawGroup: any, userGroupIndex: number, savedUserGroupId: string): void {
    const dialogRef = this.dialog.open(SaveUserGroupComponent, {
      width: "480px",
      data: { userGroupName: rawGroup.name },
      panelClass: "save-user-group-dialog"
    });

    dialogRef.afterClosed().subscribe((result: any) => {
      if (result?.action !== NsAccessControlConfig.IActions.Confirm) {
        return;
      }
      this.userGroup?.at(userGroupIndex)?.get("name")?.setValue(result?.userGroupName);

      const mapped = this.processRequestCreationV2({ ...rawGroup, name: result?.userGroupName });
      const criteria = mapped?.userGroupCriteriaList;
      if (!criteria?.length) {
        this.callSnackbar("Please add at least one condition with a selection.", "error");
        return;
      }
      this.appendOwnOrganisationCriteria(criteria);

      const payload: IReusableUserGroupRequest = {
        request: {
          userGroupName: result?.userGroupName,
          criteria: criteria
        }
      };
      if (savedUserGroupId) {
        payload.request.userGroupId = savedUserGroupId;
        this.updateUserGroup(payload, userGroupIndex);
      } else {
        this.createUserGroup(payload, userGroupIndex);
      }
    });
  }

  /** Puts a saved id onto the first group, without it the next save would copy it instead. */
  private keepSavedUserGroupId(userGroupId: string, userGroupIndex: number = 0): void {
    const group = this.userGroup?.at(userGroupIndex) as FormGroup;
    if (!userGroupId || !group) {
      return;
    }
    const control = group.get("savedUserGroupId");
    if (control) {
      control.setValue(userGroupId, { emitEvent: false });
    } else {
      group.addControl("savedUserGroupId", this.fb.control(userGroupId), { emitEvent: false });
    }
  }

   createUserGroup(payload: IReusableUserGroupRequest, userGroupIndex: number = 0): void {
    this.isSavingReusableUserGroup = true;
    this.accessControlService
      .createReusableUserGroup(payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: response => {
          if (response?.result) {
            this.keepSavedUserGroupId(response.result?.usergroupid, userGroupIndex);
            this.markUserGroupConditionsSaved(userGroupIndex);
            this.accessControlData.emit({
              userGroup: response.result.accessControl?.userGroups,
              accessType: this.accessType,
              action: "CREATED",
              userGroupId: response.result?.usergroupid
            });
            this.callSnackbar("User group saved successfully", "success");
          } else {
            this.callSnackbar("Could not save the user group, Please try again.", "error");
          }
          this.isSavingReusableUserGroup = false;
        },
        error: (error) => {
          this.callSnackbar(error?.error?.params?.err || error?.error?.params?.errMsg || "Could not save the user group, Please try again.", "error");
          this.isSavingReusableUserGroup = false;
        }
      });
  }

  updateUserGroup(payload: IReusableUserGroupRequest, userGroupIndex: number = 0): void {
    this.isSavingReusableUserGroup = true;
    this.accessControlService
      .updateReusableUserGroup(payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: response => {
          if (response?.result) {
            this.keepSavedUserGroupId(response.result?.usergroupid, userGroupIndex);
            this.markUserGroupConditionsSaved(userGroupIndex);
            this.accessControlData.emit({
              userGroup: response.result.accessControl?.userGroups,
              accessType: this.accessType,
              action: "UPDATED",
              userGroupId: response.result?.usergroupid
            });
            this.callSnackbar("User group updated successfully", "success");
          } else {
            this.callSnackbar("Could not update the user group, Please try again.", "error");
          }
          this.isSavingReusableUserGroup = false;
        },
        error: (error) => {
          this.callSnackbar(error?.error?.params?.err || error?.error?.params?.errMsg ||"Could not update the user group, Please try again.", "error");
          this.isSavingReusableUserGroup = false;
        }
      });
  }

  get mdoContentHasValue(): boolean {
    return !!(this.mdoContent && Object.keys(this.mdoContent).length > 0);
  }

  /**
   * Lists the saved (reusable) user groups and applies the selected one as a new OR group.
   * The saved group itself is never changed by this.
   */
  /** Ids of the saved groups already on this step, they cannot be taken a second time. */
  private usedUserGroupIds(): string[] {
    return (this.userGroup?.getRawValue() || [])
      .map((group: any) => group?.savedUserGroupId)
      .filter((userGroupId: any) => !!userGroupId);
  }

  reuseSavedUserGroup(): void {
    const dialogRef = this.dialog.open(ReuseUserGroupComponent, {
      width: "860px",
      maxWidth: "95vw",
      autoFocus: false,
      data: {
        optionsEntity: this.accessControlCriteriaSelection?.optionsEntity,
        usedUserGroupIds: this.usedUserGroupIds()
      },
      panelClass: "reuse-user-group-dialog"
    });

    dialogRef.afterClosed().subscribe((result: any) => {
      if (result?.action !== NsAccessControlConfig.IActions.Confirm || !result?.userGroup?.id) {
        return;
      }
      this.applySavedUserGroup(result.userGroup);
    });
  }

  private applySavedUserGroup(savedUserGroup: { id: string; name: string }): void {
    this.isApplyingSavedUserGroup = true;
    this.accessControlService
      .fetchReusableUserGroup(savedUserGroup.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: response => {
          const groupName = response?.result?.usergroupname || savedUserGroup.name;
          const isAdded = this.addUserGroupFromCriteria(
            groupName,
            response?.result?.criteria || [],
            response?.result?.usergroupid || savedUserGroup.id
          );
          if (isAdded) {
            // Sends the updated user groups out the same way every other change does
            this.applyAccessControlValue(true, false);
            this.callSnackbar(`"${groupName}" added as a new user group`, "success");
          } else {
            this.callSnackbar("This saved user group has no condition that can be applied here.", "error");
          }
          this.isApplyingSavedUserGroup = false;
        },
        error: () => {
          this.callSnackbar("Could not apply the saved user group, Please try again.", "error");
          this.isApplyingSavedUserGroup = false;
        }
      });
  }

  private addUserGroupFromCriteria(groupName: string, criteria: any[], savedUserGroupId: string = ""): boolean {
    const conditions = this.fb.array([]) as FormArray;

    criteria.forEach((entry: any) => {
      const { criteriaKey, criteriaValue } = this.toCriteriaPair(entry);
      const isAllOrganisations =
        this.isSavedAllOrganisationsCriteria(criteriaKey, criteriaValue) || this.isSavedBranchSelectAll(criteriaKey, criteriaValue);
      if (!criteriaKey || (!criteriaValue?.length && !isAllOrganisations)) {
        return;
      }

      const isOrganisationCriteria =
        criteriaKey === NsAccessControlConfig.SelectionType.Organizations || criteriaKey === MINISTRY_OR_STATE_CRITERIA_KEY;
      // The organisation condition is not offered to a MDO working within its own organisation
      if (isOrganisationCriteria && !this.isCCA && !this.canSelectOrgHierarchy) {
        return;
      }

      const condition = this.createConditionGroup(uuidv4(), this.userGroup.length);

      if (isAllOrganisations) {
        condition.patchValue({
          entity: NsAccessControlConfig.SelectionType.Organizations,
          selections: [ALL_ORGANISATIONS_SELECTION]
        });
      } else if (criteriaKey === MINISTRY_OR_STATE_CRITERIA_KEY) {
        condition.patchValue({
          entity: NsAccessControlConfig.SelectionType.Organizations,
          selections: this.getMinistryOrStateSelections(criteriaValue)
        });
      } else if (criteriaKey === NsAccessControlConfig.SelectionType.Batch) {
        condition.patchValue({ entity: criteriaKey, selections: criteriaValue.map((batch: any) => Number(batch)) });
      } else {
        condition.patchValue({ entity: criteriaKey, selections: criteriaValue });
      }

      conditions.push(condition);
    });

    if (!conditions.length) {
      return false;
    }

    this.userGroup.push(
      this.fb.group({
        id: [uuidv4()],
        savedUserGroupId: [savedUserGroupId],
        name: [groupName],
        description: [`Description for ${groupName}`],
        conditions: conditions,
        isUserGroupDisabled: [false],
        isAddConditionDisabled: [false]
      })
    );

    const userGroupIndex = this.userGroup.length - 1;
    this.markUserGroupConditionsSaved(userGroupIndex);
    this.processDisableAddConditionOnClose(userGroupIndex);
    this.calculateUserCountForUserGroup(userGroupIndex);
    return true;
  }

  private toCriteriaPair(entry: any): { criteriaKey: string; criteriaValue: any[] } {
    const criteriaKey = entry?.criteriaKey || Object.keys(entry || {})[0] || "";
    const criteriaValue = entry?.criteriaKey ? entry?.criteriaValue : entry?.[criteriaKey];
    return { criteriaKey, criteriaValue: Array.isArray(criteriaValue) ? criteriaValue : criteriaValue ? [criteriaValue] : [] };
  }
}
