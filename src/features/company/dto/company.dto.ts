import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCompanyDto {
  @ApiProperty({ description: 'Nombre de la empresa' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    description: 'Moneda principal de la empresa',
    example: 'USD',
    required: false,
  })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({
    description: 'Vertical de negocio de la empresa',
    example: 'academy',
    required: false,
  })
  @IsOptional()
  @IsString()
  vertical?: string;
}

export class AddCompanyUserDto {
  @ApiProperty({
    description: 'Identificador del usuario que se asociará a la empresa',
  })
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @ApiProperty({
    description: 'Rol opcional dentro de la empresa',
    required: false,
  })
  @IsOptional()
  @IsString()
  role?: string;
}
