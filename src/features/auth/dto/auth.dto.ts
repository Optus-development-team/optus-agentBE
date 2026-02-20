import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LoginRequestDto {
  @ApiProperty({ description: 'Token OAuth original del proveedor' })
  @IsString()
  @IsNotEmpty()
  jwt!: string;

  @ApiProperty({ description: 'Dirección Sui derivada en el FE' })
  @IsString()
  @IsNotEmpty()
  suiAddress!: string;

  @ApiProperty({ description: 'Salt generado en el frontend' })
  @IsString()
  @IsNotEmpty()
  salt!: string;

  @ApiProperty({
    required: false,
    description: 'Alias opcional para mostrar en grupo',
  })
  @IsOptional()
  @IsString()
  alias?: string;
}

export class PhoneOtpRequestDto {
  @ApiProperty({ example: '+59170012345' })
  @IsString()
  @IsNotEmpty()
  phone!: string;
}

export class PhoneStatusQueryDto {
  @ApiProperty({ example: '+59170012345' })
  @IsString()
  @IsNotEmpty()
  phone!: string;
}
