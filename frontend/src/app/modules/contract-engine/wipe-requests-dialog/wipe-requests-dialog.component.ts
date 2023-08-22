import { Component, OnInit, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import {
    ContractService,
    WipeRequestActions,
} from 'src/app/services/contract.service';

@Component({
    selector: 'app-wipe-requests-dialog',
    templateUrl: './wipe-requests-dialog.component.html',
    styleUrls: ['./wipe-requests-dialog.component.scss'],
})
export class WipeRequestsDialogComponent implements OnInit {
    public WipeRequestActions = WipeRequestActions;
    contractId!: string;
    requests: string[];
    syncDate: string;
    loading: boolean = false;

    constructor(
        public dialogRef: MatDialogRef<WipeRequestsDialogComponent>,
        public contractService: ContractService,
        @Inject(MAT_DIALOG_DATA) public data: any
    ) {
        this.requests = data.requests;
        this.syncDate = data.syncDate;
        this.contractId = data.contractId;
    }

    ngOnInit(): void {}

    onNoClick(): void {
        this.dialogRef.close(null);
    }

    sync(event: any) {
        event.target.classList.add('spin');
        setTimeout(() => event.target.classList.remove('spin'), 1000);
        this.contractService.wipeRequests(this.contractId).subscribe(
            (result) => {
                event.target.classList.remove('spin');
                this.requests = result.requests;
                this.syncDate = result.syncDate;
            },
            () => event.target.classList.remove('spin')
        );
    }

    requestAction(request: string, action: WipeRequestActions) {
        this.loading = true;
        this.contractService
            .wipeRequestAction(this.contractId, request, action)
            .subscribe(
                (result) => {
                    this.requests = this.requests.filter(
                        (item) => item !== request
                    );
                },
                () => {},
                () => (this.loading = false)
            );
    }
}
