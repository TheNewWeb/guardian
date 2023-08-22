import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ContractConfigComponent } from './contract-config/contract-config.component';
import { AddPairDialogComponent } from './add-pair-dialog/add-pair-dialog.component';
import { RetireTokenDialogComponent } from './retire-token-dialog/retire-token-dialog.component';
import { CommonComponentsModule } from '../common/common-components.module';
import { MaterialModule } from '../common/material.module';
import { TagEngineModule } from '../tag-engine/tag-engine.module';
import { AppRoutingModule } from 'src/app/app-routing.module';
import { DialogWrapperComponent } from './dialog-wrapper/dialog-wrapper.component';
import { RetirePairsDialogComponent } from './retire-pairs-dialog/retire-pairs-dialog.component';
import { RetireRequestsDialogComponent } from './retire-requests-dialog/retire-requests-dialog.component';
import { WipeRequestsDialogComponent } from './wipe-requests-dialog/wipe-requests-dialog.component';
import { RefreshBtnComponent } from './refresh-btn/refresh-btn.component';
import { TokenCount } from './pipes/token-count.pipe';

@NgModule({
    declarations: [
        ContractConfigComponent,
        AddPairDialogComponent,
        RetireTokenDialogComponent,
        DialogWrapperComponent,
        RetirePairsDialogComponent,
        RetireRequestsDialogComponent,
        WipeRequestsDialogComponent,
        RefreshBtnComponent,
        TokenCount,
    ],
    imports: [
        CommonModule,
        FormsModule,
        CommonComponentsModule,
        MaterialModule,
        TagEngineModule,
        AppRoutingModule,
    ],
    exports: [],
})
export class ContractEngineModule { }
