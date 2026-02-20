import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBase64,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
export class GasPaymentDto {
  @ApiProperty({ description: 'Object ID of the gas coin' })
  @IsString()
  @IsNotEmpty()
  objectId!: string;

  @ApiProperty({ description: 'Version of the gas coin' })
  @IsString()
  @IsNotEmpty()
  version!: string;

  @ApiProperty({ description: 'Digest of the gas coin' })
  @IsString()
  @IsNotEmpty()
  digest!: string;
}

export class BaseTxDto {
  @ApiProperty({
    description: 'Base64 transaction kind bytes (onlyTransactionKind)',
    example: 'AAUAIQElAqAvQfIg...',
  })
  @IsBase64()
  @IsNotEmpty()
  transactionBytes!: string;

  @ApiProperty({
    description: 'User address acting as sender of the PTB',
    example:
      '0x9bef96836024945e4734c115afbdc8bddeeb8c58981252cd51c1ae4c8c99eb1c',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^0x[0-9a-fA-F]{40,64}$/)
  sender!: string;

  @ApiProperty({
    description:
      'Optional sponsor gas payments (objectId, version, digest). If omitted, backend picks a sponsor coin.',
    required: false,
    type: [GasPaymentDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GasPaymentDto)
  gasPayments?: GasPaymentDto[];
}

export type BaseTxPayload = Pick<
  BaseTxDto,
  'transactionBytes' | 'sender' | 'gasPayments'
>;

export class SponsorCreateDto extends BaseTxDto {}

export class SponsorDepositDto extends BaseTxDto {
  @ApiProperty({ required: false, description: 'ID de transacción opcional' })
  @IsOptional()
  @IsString()
  transactionId?: string;
}

export class SponsorPayoutDto extends BaseTxDto {
  @ApiProperty({ example: 'FIAT' })
  @IsString()
  @IsNotEmpty()
  mode!: string;
}

export class SponsorDeployDto extends BaseTxDto {}

export class NotifySuccessDto {
  @ApiProperty({ example: '0xTxHash...' })
  @IsString()
  @IsNotEmpty()
  digest!: string;
}
