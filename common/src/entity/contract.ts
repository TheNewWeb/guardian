import { BeforeCreate, Entity, Property } from '@mikro-orm/core';
import { BaseEntity } from '../models';
import { ContractStatus, ContractType } from '@guardian/interfaces';

/**
 * Contract collection
 */
@Entity()
export class Contract extends BaseEntity {
    /**
     * Hedera Contract Id
     */
    @Property({ nullable: true })
    contractId?: string;

    /**
     * Description
     */
    @Property({ nullable: true })
    description?: string;

    /**
     * Owner
     */
    @Property({ nullable: true })
    owner?: string;

    /**
     * Contract permissions
     */
    @Property({ nullable: true })
    permissions?: string;

    /**
     * Topic id
     */
    @Property({ nullable: true })
    topicId?: string;

    /**
     * Type
     */
    @Property({ nullable: true })
    type?: ContractType;

    /**
     * Cache
     */
    @Property({ nullable: true, type: 'unknown'})
    cache?: any
}
