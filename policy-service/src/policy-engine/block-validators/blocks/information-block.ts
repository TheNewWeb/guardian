import { BlockValidator, IBlockProp } from '@policy-engine/block-validators';

/**
 * Information block
 */
export class InformationBlock {
    /**
     * Block type
     */
    public static readonly blockType: string = 'informationBlock';

    /**
     * Validate block options
     * @param validator
     * @param config
     */
    public static async validate(validator: BlockValidator, ref: IBlockProp): Promise<void> {
        return;
    }
}
