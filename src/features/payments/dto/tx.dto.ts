import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class NotifySuccessDto {
  @ApiProperty({
    example: 'TRX-123456',
    description: 'Referencia externa de la transacción confirmada',
  })
  @IsString()
  @IsNotEmpty()
  transactionReference!: string;
}
