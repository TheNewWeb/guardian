import { Component, Inject, OnInit } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { ContractService, WipeRequestActions } from 'src/app/services/contract.service';

@Component({
  selector: 'app-retire-pairs-dialog',
  templateUrl: './retire-pairs-dialog.component.html',
  styleUrls: ['./retire-pairs-dialog.component.scss']
})
export class RetirePairsDialogComponent implements OnInit {
    contractId!: string;
    pairs: any[] = [
        {
            base: 't1',
            opposite: 't2',
            baseCount: 1,
            oppositeCount: 2,
            available: false,
        },
        {
            base: 't1',
            opposite: 't2',
            baseCount: 1,
            oppositeCount: 2,
            available: false,
        },
        {
            base: 't1',
            opposite: 't2',
            baseCount: 1,
            oppositeCount: 2,
            available: true,
        },
        {
            base: 't1',
            opposite: 't2',
            baseCount: 1,
            oppositeCount: 2,
            available: false,
        }
    ];
    syncDate: string;
    loading: boolean = false;

    constructor(
        public dialogRef: MatDialogRef<RetirePairsDialogComponent>,
        public contractService: ContractService,
        @Inject(MAT_DIALOG_DATA) public data: any
    ) {
        this.pairs = data.pairs;
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
        this.contractService.retirePairs(this.contractId).subscribe(
            (result) => {
                event.target.classList.remove('spin');
                this.pairs = result.pairs;
                this.syncDate = result.pairsSyncDate;
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
                    this.pairs = this.pairs.filter(
                        (item) => item !== request
                    );
                },
                () => {},
                () => (this.loading = false)
            );
    }

}
