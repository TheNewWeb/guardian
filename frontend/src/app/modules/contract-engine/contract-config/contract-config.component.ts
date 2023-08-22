import { Component, OnDestroy, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import {
    ContractType,
    IUser,
    SchemaHelper,
    TagType,
    Token,
} from '@guardian/interfaces';
import { ProfileService } from 'src/app/services/profile.service';
import { TokenService } from 'src/app/services/token.service';
import { ContractService } from 'src/app/services/contract.service';
import { MatIcon } from '@angular/material/icon';
import { TagsService } from 'src/app/services/tag.service';
import { forkJoin } from 'rxjs';
import { ActivatedRoute, Route, Router } from '@angular/router';
import { AddPairDialogComponent } from '../add-pair-dialog/add-pair-dialog.component';
import { DataInputDialogComponent } from '../../common/data-input-dialog/data-input-dialog.component';
import { WipeRequestsDialogComponent } from '../wipe-requests-dialog/wipe-requests-dialog.component';
import { RetirePairsDialogComponent } from '../retire-pairs-dialog/retire-pairs-dialog.component';

/**
 * Component for operating with Contracts
 */
@Component({
    selector: 'contract-config',
    templateUrl: './contract-config.component.html',
    styleUrls: ['./contract-config.component.css'],
})
export class ContractConfigComponent implements OnInit, OnDestroy {
    contracts: any[] | null;
    columns: string[] = [];
    role!: any;
    loading: boolean = true;
    isConfirmed: boolean = false;
    pageIndex: number;
    pageSize: number;
    contractsCount: any = 0;
    tagEntity = TagType.Contract;
    owner: any;
    tagSchemas: any[] = [];
    wipeOperations = [
        {
            id: 'wipeRequests',
            title: 'Requests',
            description: 'Open wipe requests dialog.',
            color: '#4caf50',
        },
        {
            id: 'addAdmin',
            title: 'Add admin',
            description: 'Add contract admin.',
            color: '#4caf50',
        },
        {
            id: 'addUser',
            title: 'Add manager',
            description: 'Add contract manager.',
            color: '#9c27b0',
        },
        {
            id: 'addPair',
            title: 'Add Pair',
            description: 'Add Contract Pair.',
            color: '#4caf50',
        },
        {
            id: 'addUser',
            title: 'Add User',
            description: 'Add User To Contract.',
            color: '#9c27b0',
        },
    ];
    retireOperations = [
        {
            id: 'pairs',
            title: 'Pairs',
            description: 'Add contract admin.',
            color: '#4caf50',
        },
        {
            id: 'requests',
            title: 'Requests',
            description: 'Add contract admin.',
            color: '#4caf50',
        },
        {
            id: 'setPair',
            title: 'Set pair',
            description: 'Set contract admin.',
            color: '#4caf50',
        },
    ];
    type: ContractType = ContractType.WIPE;

    constructor(
        public tagsService: TagsService,
        private profileService: ProfileService,
        private contractsService: ContractService,
        private tokenService: TokenService,
        private dialog: MatDialog,
        private router: Router,
        private route: ActivatedRoute,
    ) {
        this.contracts = null;
        this.pageIndex = 0;
        this.pageSize = 100;
        this.columns = [
            'contractId',
            'description',
            'tags',
            'permissions',
            'operations',
        ];
    }

    onChangeType(event: any) {
        this.pageIndex = 0;
        this.pageSize = 100;
        this.router.navigate(['/contracts'], {
            queryParams: { type: this.type },
        });
        this.loadAllContracts();
    }

    ngOnInit() {
        this.loading = true;
        this.type = this.route.snapshot.queryParams['type'];
        this.loadContracts();
    }

    ngOnDestroy() {}

    loadContracts() {
        this.contracts = null;
        this.isConfirmed = false;
        this.loading = true;
        forkJoin([
            this.profileService.getProfile(),
            this.tagsService.getPublishedSchemas(),
        ]).subscribe(
            (value) => {
                const profile: IUser | null = value[0];
                const tagSchemas: any[] = value[1] || [];

                this.isConfirmed = !!(profile && profile.confirmed);
                this.role = profile ? profile.role : null;
                this.owner = profile?.did;
                this.tagSchemas = SchemaHelper.map(tagSchemas);

                if (this.isConfirmed) {
                    this.loadAllContracts();
                } else {
                    setTimeout(() => {
                        this.loading = false;
                    }, 500);
                }
            },
            (e) => {
                this.loading = false;
            }
        );
    }

    loadAllContracts() {
        this.loading = true;
        this.contractsService
            .page(this.type, this.pageIndex, this.pageSize)
            .subscribe(
                (policiesResponse) => {
                    this.contracts = policiesResponse.body || [];
                    this.contractsCount =
                        policiesResponse.headers.get('X-Total-Count') ||
                        this.contracts.length;

                    const ids = this.contracts.map((e) => e.id);
                    this.tagsService.search(this.tagEntity, ids).subscribe(
                        (data) => {
                            if (this.contracts) {
                                for (const contract of this.contracts) {
                                    (contract as any)._tags = data[contract.id];
                                }
                            }
                            setTimeout(() => {
                                this.loading = false;
                            }, 500);
                        },
                        (e) => {
                            console.error(e.error);
                            this.loading = false;
                        }
                    );
                },
                (e) => {
                    this.loading = false;
                }
            );
    }

    onPage(event: any) {
        if (this.pageSize != event.pageSize) {
            this.pageIndex = 0;
            this.pageSize = event.pageSize;
        } else {
            this.pageIndex = event.pageIndex;
            this.pageSize = event.pageSize;
        }
        this.loadAllContracts();
    }

    importContract() {
        const dialogRef = this.dialog.open(DataInputDialogComponent, {
            width: '500px',
            autoFocus: false,
            disableClose: true,
            data: {
                fieldsConfig: [
                    {
                        name: 'contractId',
                        label: 'Contract Identifier',
                        placeholder: 'Contract Identifier',
                        required: true,
                    },
                    {
                        name: 'description',
                        label: 'Description',
                        placeholder: 'Description',
                        required: false,
                    },
                ],
                title: 'Import Contract',
            },
        });
        dialogRef.afterClosed().subscribe(async (result) => {
            if (result) {
                this.loading = true;
                this.contractsService
                    .import(
                        result.contractId?.trim(),
                        result.description?.trim()
                    )
                    .subscribe(
                        () => {
                            this.loading = false;
                            this.loadContracts();
                        },
                        () => (this.loading = false)
                    );
            }
        });
    }

    createContract() {
        const dialogRef = this.dialog.open(DataInputDialogComponent, {
            width: '500px',
            autoFocus: false,
            disableClose: true,
            data: {
                fieldsConfig: [
                    {
                        name: 'description',
                        label: 'Description',
                        placeholder: 'Description',
                        required: false,
                    },
                ],
                title: 'Create Contract',
            },
        });
        dialogRef.afterClosed().subscribe(async (result) => {
            if (!result) {
                return;
            }
            this.loading = true;
            this.contractsService
                .create(result.description?.trim(), this.type)
                .subscribe(
                    (res) => {
                        this.loading = false;
                        this.loadContracts();
                    },
                    () => (this.loading = false)
                );
        });
    }

    addUser(contractId: string) {
        const dialogRef = this.dialog.open(DataInputDialogComponent, {
            width: '500px',
            autoFocus: false,
            disableClose: true,
            data: {
                fieldsConfig: [
                    {
                        name: 'userId',
                        label: 'User Identifier',
                        placeholder: 'User Identifier',
                        required: true,
                    },
                ],
                title: 'Enter User Identifier',
            },
        });
        dialogRef.afterClosed().subscribe(async (result) => {
            if (!result) {
                return;
            }
            this.loading = true;
            this.contractsService
                .addUser(result.userId?.trim(), contractId)
                .subscribe(
                    (res) => {
                        this.loading = false;
                        this.loadContracts();
                    },
                    () => (this.loading = false)
                );
        });
    }

    onOperationAction(event: any, element: any) {
        switch (event.id) {
            case 'wipeRequests':
                this.openWipeRequests(element);
                break;
            case 'addPair':
                this.addPair(element);
                break;
            case 'pairs':
                this.openPairs(element);
                break;
            case 'setPair':
                this.addPair(element.contractId);
                break;
            default:
        }
    }

    addPair(contractId: string) {
        this.loading = true;
        this.tokenService.getTokens().subscribe(
            (data: any) => {
                this.loading = false;
                const tokens = data
                    .map((e: any) => new Token(e))
                    .filter(
                        (token: Token) => !token.draftToken
                    );
                const dialogRef = this.dialog.open(AddPairDialogComponent, {
                    width: '650px',
                    panelClass: 'g-dialog',
                    disableClose: true,
                    autoFocus: false,
                    data: {
                        tokens,
                        contractId,
                    },
                });
                dialogRef.afterClosed().subscribe(async (result) => {
                    if (result) {
                        this.loading = true;
                        this.contractsService
                            .createPair(
                                result.contractId,
                                result.baseTokenId,
                                result.oppositeTokenId,
                                result.baseTokenCount,
                                result.oppositeTokenCount
                            )
                            .subscribe(
                                () => (this.loading = false),
                                () => (this.loading = false)
                            );
                    }
                });
            },
            (e) => {
                this.loading = false;
                console.error(e.error);
            }
        );
    }

    checkStatus(contract: any, event: any) {
        event.target.classList.add('spin');
        this.contractsService.updateStatus(contract.contractId).subscribe(
            (result) => {
                event.target.classList.remove('spin');
                contract.permissions = result;
            },
            () => event.target.classList.remove('spin')
        );
    }

    openWipeRequests(contract: any) {
        this.dialog.open(WipeRequestsDialogComponent, {
            width: '650px',
            panelClass: 'g-dialog',
            disableClose: true,
            autoFocus: false,
            data: {
                requests: contract.cache?.requests,
                syncDate: contract.cache?.syncDate,
                contractId: contract.contractId
            }
        });
    }

    openPairs(contract: any) {
        this.dialog.open(RetirePairsDialogComponent, {
            width: '800px',
            panelClass: 'g-dialog',
            disableClose: true,
            autoFocus: false,
            data: {
                pairs: contract.cache?.pairs,
                syncDate: contract.cache?.pairsSyncDate,
                contractId: contract.contractId
            }
        });
    }
}
