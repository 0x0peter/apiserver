import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity('pools')
@Index('idx_pairs_address', ['pairsAddress'], { unique: true })
export class Pool {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'pairs_address', length: 42, unique: true })
  pairsAddress: string;

  @Column({ name: 'pairs_name', length: 100 })
  pairsName: string;

  @Column({ name: 'TVL', type: 'decimal', precision: 65, scale: 8 })
  TVL: number;

  @Column({ type: 'decimal', precision: 18, scale: 8 })
  APY: number;

  @Column({ name: 'block_number', type: 'integer' })
  blockNumber: number;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}