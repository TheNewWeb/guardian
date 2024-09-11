import { SourceAddon, StateField } from '../helpers/decorators/index.js';
import { PolicyComponentsUtils } from '../policy-components-utils.js';
import { IPolicyAddonBlock, IPolicySourceBlock } from '../policy-engine.interface.js';
import { ChildrenType, ControlType } from '../interfaces/block-about.js';
import { PolicyUser } from '../policy-user.js';
import { ExternalEvent, ExternalEventType } from '../interfaces/external-event.js';

/**
 * Pagination addon
 */
@SourceAddon({
    blockType: 'paginationAddon',
    about: {
        label: 'Pagination',
        title: `Add 'Pagination' Addon`,
        post: true,
        get: true,
        children: ChildrenType.None,
        control: ControlType.Special,
        input: null,
        output: null,
        defaultEvent: false
    },
    variables: []
})
export class PaginationAddon {

    /**
     * Block state field
     * @private
     */
    @StateField()
    private state;

    private prevState;

    constructor() {
        if (!this.state) {
            this.state = {}
        }
        if (!this.prevState) {
            this.prevState = {}
        }
    }

    /**
     * Get pagination state
     * @param user
     */
    public async getState(user: PolicyUser):Promise<any> {
        if (!this.state[user.id]) {
            this.state[user.id] = {
                size: 20,
                itemsPerPage: 10,
                page: 0
            }
        }
        const ref = PolicyComponentsUtils.GetBlockRef(this);
        const totalCount = await (ref.parent as IPolicySourceBlock).getGlobalSources(user, null, true);

        if (this.state[user.id].size !== totalCount) {
            this.state[user.id].size = totalCount;
        }

        return this.state[user.id];
    }

    /**
     * Set pagination state
     * @param user
     * @param data
     */
    public async setState(user: PolicyUser, data: any): Promise<any> {
        this.prevState[user.id] = {...this.state[user.id]};

        const {size, itemsPerPage, page} = data;
        this.state[user.id] = {size, itemsPerPage, page};

        const ref = PolicyComponentsUtils.GetBlockRef(this);
        const totalCount = await (ref.parent as IPolicySourceBlock).getGlobalSources(user, null, true);

        if (this.state[user.id].size !== totalCount) {
            this.state[user.id].size = totalCount;
        }
    }

    async resetPagination(user: PolicyUser): Promise<void> {
        const ref = PolicyComponentsUtils.GetBlockRef<IPolicyAddonBlock>(this);
        if (this.prevState[user.id]) {
            this.state[user.id] = this.prevState[user.id];
            delete this.prevState[user.id];
        }
    }

    /**
     * Get block data
     * @param user
     */
    public async getData(user: PolicyUser): Promise<any> {
        return this.getState(user);
    }

    /**
     * Set block data
     * @param user
     * @param data
     */
    public async setData(user: PolicyUser, data: any): Promise<void> {
        const oldState = this.state;
        oldState[user.id] = data;
        this.state = oldState;

        const ref = PolicyComponentsUtils.GetBlockRef(this);
        PolicyComponentsUtils.BlockUpdateFn(ref.parent, user);
        PolicyComponentsUtils.ExternalEventFn(new ExternalEvent(ExternalEventType.Set, ref, user, data));
    }
}
