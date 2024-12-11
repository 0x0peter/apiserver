import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity('tokens')
@Index('idx_token_address', ['tokenAddress'], { unique: true })
export class Tokens {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'token_address', length: 42, unique: true })
  tokenAddress: string;

  @Column({ name: 'token_name', length: 100 })
  tokenName: string;

  @Column({ name: 'token_symbol', length: 10 })
  tokenSymbol: string;

  @Column({ type: 'decimal', precision: 18, scale: 8 })
  price: number;

  @Column({ name: 'fdv', type: 'decimal', precision: 18, scale: 2 })
  FDV: number;

  @Column({ name: 'block_number', type: 'integer' })
  blockNumber: number;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}