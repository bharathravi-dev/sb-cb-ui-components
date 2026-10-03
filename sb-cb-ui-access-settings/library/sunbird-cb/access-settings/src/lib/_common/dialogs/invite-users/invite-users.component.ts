import { Component, inject, OnDestroy, OnInit } from "@angular/core";
import { FormControl } from "@angular/forms";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";
import { AccessControlService } from "../../../_services/access-control.service";
import { MatSnackBar } from "@angular/material/snack-bar";
import { PageChangeEmitter } from "../../../_models/pagination.model";
import { NsAccessControlConfig } from "../../../_models/access-control.model";
import { ALL_ORGANISATIONS_SELECTION, MINISTRY_OR_STATE_FILTER_KEY } from "../../../_constants/app.constants";
import { SnackbarComponent } from "../../../components/snackbar/snackbar.component";
import { Subject } from "rxjs";
import { first, takeUntil } from "rxjs/operators";

@Component({
    selector: "sb-uic-invite-users",
    templateUrl: "./invite-users.component.html",
    styleUrls: ["./invite-users.component.scss"],
    standalone: false
})
export class InviteUsersComponent implements OnInit, OnDestroy {
  public readonly data = inject<any>(MAT_DIALOG_DATA);
  private destroy$ = new Subject<void>();

  searchControl = new FormControl("");
  filterValue: NsAccessControlConfig.IManageSelectionType = "add_karmayogis";

  usersList: any[] = [];
  totalUsers: number = 0;

  holdSelectedUsers: any[] = [];
  finalSelectedUsers: any[] = [];
  usersFinalList: any[] = [];
  bulkUploadUserList: any[] = [];

  usersTableConfig!: NsAccessControlConfig.ITableConfig;
  usersLoading = false;
  activeTab = 0;
  sortState: any = {};
  pagination: { limit: number; offset: number } = {
    limit: 5,
    offset: 0,
  };

  filters: any = {};
  currentPage = 1;
  isCCA = false;
  constructor(public dialogRef: MatDialogRef<InviteUsersComponent>, private accessControlService: AccessControlService, private snackbar: MatSnackBar) {}

  ngOnInit(): void {
    this.usersTableConfig = this.accessControlService.accessControlConfig().usersTableConfig;
    this.isCCA = this.accessControlService.accessControlConfig()?.userConfig?.org?.isCCA ?? false;
    if (this.data && this.data.selected && this.data.selected.length) {
      if (!this.isArrayOfObjects(this.data?.selected)) {
        this.getUsersList("", this.data?.selected?.length, this.pagination.offset, this.data?.selected);
      } else {
        this.usersFinalList = [...this.data.selected];
        this.holdSelectedUsers = [...this.usersFinalList];
        this.finalSelectedUsers = [...this.usersFinalList];
        this.activeTab = 1;
      }
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onClose(): void {
    this.dialogRef.close();
  }

  search(): void {
    let reducedData: any = {};
    this.resetPagination();
    this.sortState = {};

    const pickEntity = [
      NsAccessControlConfig.SelectionType.Organizations,
      NsAccessControlConfig.SelectionType.VerificationStatus,
      NsAccessControlConfig.SelectionType.Designation,
      NsAccessControlConfig.SelectionType.Group,
      NsAccessControlConfig.SelectionType.Cadre,
      NsAccessControlConfig.SelectionType.Service,
      NsAccessControlConfig.SelectionType.Batch,
      NsAccessControlConfig.SelectionType.CentralDeputation,
    ];

    if (this.accessControlService.accessControlConfig()?.application === NsAccessControlConfig.Application.MDO) {
      if (!this.isCCA) {
        reducedData.rootOrgId = this.accessControlService.accessControlConfig().userConfig.org?.rootOrgId ? [this.accessControlService.accessControlConfig().userConfig.org?.rootOrgId] : [];
      }
    }

    if (this.data?.rule?.conditions.length) {
      reducedData = this.data?.rule?.conditions.reduce((acc: any, curr: any) => {
        acc[curr.entity] = curr.selections;
        // if (pickEntity.includes(curr.entity)) {
        //   acc[curr.entity] = curr.selections;
        // }
        return acc;
      }, { ...reducedData });
    }

    // "Select all" organisations is a form placeholder, the search reads the scope it stands for
    const ministryOrStateId = this.resolveOrganisationScope(reducedData);

    // A non CCA MDO always stays within its own organisation unless organisations
    // have been explicitly picked from its hierarchy, or the whole ministry / state is selected
    if (this.accessControlService.accessControlConfig()?.application === NsAccessControlConfig.Application.MDO && !this.isCCA && !reducedData.rootOrgId?.length && !ministryOrStateId.length) {
      reducedData.rootOrgId = this.accessControlService.accessControlConfig().userConfig.org?.rootOrgId ? [this.accessControlService.accessControlConfig().userConfig.org?.rootOrgId] : [];
    }

    if (Object.keys(reducedData)?.length) {
      this.filters = {
        rootOrgId: reducedData?.rootOrgId?.length ? reducedData.rootOrgId : undefined,
        "profileDetails.profileStatus": reducedData.profilestatus,
        "profileDetails.professionalDetails.designation": reducedData.designation,
        "profileDetails.professionalDetails.group": reducedData.group,
        "profileDetails.cadreDetails.cadreName": reducedData.Cadre,
        "profileDetails.cadreDetails.civilServiceName": reducedData.service,
        "profileDetails.cadreDetails.cadreBatch": reducedData.batch,
        status: 1,
      };

      if (ministryOrStateId.length) {
        this.filters[MINISTRY_OR_STATE_FILTER_KEY] = ministryOrStateId;
      }

      const centralDeputationSelections = reducedData[NsAccessControlConfig.SelectionType.CentralDeputation];
      const centralDeputation = Array.isArray(centralDeputationSelections) ? centralDeputationSelections[0] : centralDeputationSelections;
      if (typeof centralDeputation === "boolean") {
        this.filters["profileDetails.cadreDetails.isOnCentralDeputation"] = centralDeputation;
      } else if (centralDeputation === "true" || centralDeputation === "false") {
        this.filters["profileDetails.cadreDetails.isOnCentralDeputation"] = centralDeputation === "true";
      }

      Object.keys(reducedData).forEach((key: any) => {
        const value = reducedData[key];
        const hasValue = Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && value !== "";
        if (key && hasValue && !pickEntity.includes(key) && key !== "user") {
          if (!this.filters.orgCustomFields) {
             this.filters.orgCustomFields = {};
          }
          if (Array.isArray(reducedData[key]) && reducedData[key].every((item: any) => item && typeof item === "object")) {
            reducedData[key] = reducedData[key].map((value: any) => value?.fieldValue);
          }
          this.filters.orgCustomFields[key] = reducedData[key];
        }
      });

    }

    this.getUsersList(this.searchControl.value, this.pagination.limit, this.pagination.offset, [], this.filters, this.sortState);
  }

  onFilterChange(event: any): void {
    if (event?.value === "bulk_upload_karmayogis") this.bulkUploadUserList = [];
    this.filterValue = event.value;
  }

  getUsersList(query: string, limit?: number, offset?: number, userIds?: string[], filters?: any, sorting?: any): void {
    this.usersLoading = true;
    this.accessControlService
      .fetchUserList(query, { limit: limit, offset: offset }, userIds, filters, sorting)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response?.result && response?.result?.response?.content) {
            this.usersList = response?.result?.response?.content;
            this.totalUsers = response?.result?.response?.count;
            if (userIds?.length) {
              this.finalSelectedUsers = response.result.response.content;
              this.holdSelectedUsers = this.finalSelectedUsers;
              this.activeTab = 1;
            }
            if (this.holdSelectedUsers?.length) {
              this.usersFinalList = [...this.holdSelectedUsers];
            }
          } else {
            this.usersList = [];
            this.totalUsers = 0;
          }
          this.usersLoading = false;
        },
        complete: () => {
          this.usersLoading = false;
        },
      });
  }

  onSelectingUser(event: any): void {
    this.holdSelectedUsers = [...event.selectedRows];
  }

  selectUsers(): void {
    this.finalSelectedUsers = this.holdSelectedUsers;
    this.usersFinalList = [...this.finalSelectedUsers];
    this.snackbar.openFromComponent(SnackbarComponent, {
      data: { message: `Users added to Selected tab`, type: "success" },
      duration: 3000,
      panelClass: "course-success-snackbar",
    });
    this.activeTab = 1;
  }

  onPageChange(event: PageChangeEmitter): void {
    this.currentPage = event.currentPage;
    this.pagination.limit = event.limit;
    this.pagination.offset = (event.currentPage - 1) * this.pagination.limit;
    this.getUsersList(this.searchControl.value, this.pagination.limit, this.pagination.offset, [], this.filters, this.sortState);
  }

  removedUserData(event: any): void {
    this.finalSelectedUsers = [...event.remainingList];
    this.holdSelectedUsers = this.finalSelectedUsers;
  }

  onSelectingUserToApply(event: any): void {
    this.usersFinalList = [...event.selectedRows];
    this.holdSelectedUsers = [...event.selectedRows];
  }

  applySelections(): void {
    this.dialogRef.close({ rule: this.data.rule, condition: this.data.condition, selected: this.usersFinalList });
  }

  /**
   * Organisation scope of the search, matching what the user group saves:
   * - "Select all" on a CCA searches every organisation, no rootOrgId filter
   * - "Select all" of a L0, or every organisation of its hierarchy picked, is its whole ministry / state
   * - "Select all" of a L1 -> L10 is every organisation of its branch
   * Updates reducedData.rootOrgId and returns the ministry / state filter, empty when not used.
   */
  private resolveOrganisationScope(reducedData: any): string[] {
    const config = this.accessControlService.accessControlConfig();
    const selections: any[] = Array.isArray(reducedData.rootOrgId) ? reducedData.rootOrgId : [];
    if (config?.application !== NsAccessControlConfig.Application.MDO || !selections.length) {
      return [];
    }

    const isAllSelected = selections.includes(ALL_ORGANISATIONS_SELECTION);
    const hierarchyOrgIds = this.accessControlService.getOrgHierarchyOrgIds();
    const isL0 = !this.isCCA && hierarchyOrgIds.length > 0 && this.accessControlService.isL0MdoUser(config);
    const loggedInOrgId = this.accessControlService.getLoggedInOrgId(config);

    if (isL0 && loggedInOrgId && (isAllSelected || this.accessControlService.areAllOrgHierarchyOrgsSelected(selections))) {
      reducedData.rootOrgId = [];
      return [loggedInOrgId];
    }
    if (isAllSelected) {
      reducedData.rootOrgId = this.isCCA ? [] : hierarchyOrgIds;
    }
    return [];
  }

  isArrayOfObjects(arr: any): boolean {
    return Array.isArray(arr) && arr.every((item) => typeof item === "object" && item !== null && !Array.isArray(item));
  }

  onSortChange(sortState: any): void {
    this.sortState = sortState;
    this.getUsersList(this.searchControl.value, this.pagination.limit, this.pagination.offset, [], this.filters, sortState);
  }

  resetPagination(): void {
    this.currentPage = 1;
    this.pagination.limit = 5;
    this.pagination.offset = 0;
  }

  onApplyingUserBulkUpload(event: any) {
    this.bulkUploadUserList = event;
  }

  applySelectionsBulk(): void {
    this.dialogRef.close({ rule: this.data.rule, condition: this.data.condition, selected: this.bulkUploadUserList });
  }
}
