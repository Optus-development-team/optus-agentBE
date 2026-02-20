import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class ZkProofRequestDto {
  @ApiProperty({
    description: 'JWT retornado por zkLogin',
    example: 'eyJhbGciOi...',
  })
  @IsString()
  @IsNotEmpty()
  jwt!: string;

  @ApiProperty({
    description: 'Clave pública efímera extendida generada durante zkLogin',
    example:
      '84029355920633174015103288781128426107680789454168570548782290541079926444544',
  })
  @IsString()
  @IsNotEmpty()
  extendedEphemeralPublicKey!: string;

  @ApiProperty({
    description: 'Valor maxEpoch devuelto por zkLogin',
    example: 10,
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxEpoch!: number;

  @ApiProperty({
    description: 'Randomness asociado al JWT',
    example: '100681567828351849884072155819400689117',
  })
  @IsString()
  @IsNotEmpty()
  jwtRandomness!: string;

  @ApiProperty({
    description: 'Salt utilizado en el proceso de zkLogin',
    example: '248191903847969014646285995941615069143',
  })
  @IsString()
  @IsNotEmpty()
  salt!: string;

  @ApiProperty({
    description: 'Nombre del claim dentro del JWT utilizado como identificador',
    example: 'sub',
  })
  @IsString()
  @IsNotEmpty()
  keyClaimName!: string;
}
