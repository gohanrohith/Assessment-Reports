import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  IsArray,
  IsUrl,
  IsByteLength,
  ArrayMaxSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
export class LoginDto {
  @ApiProperty() @IsEmail() @MaxLength(254) email!: string;
  @ApiProperty() @IsString() @IsByteLength(12, 72) password!: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\d{6}$/) code?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() schoolId?: string;
}
export class MfaConfirmDto {
  @ApiProperty() @IsString() @MaxLength(2048) enrollmentToken!: string;
  @ApiProperty() @Matches(/^\d{6}$/) code!: string;
}
export class SwitchDto {
  @ApiProperty() @IsUUID() schoolId!: string;
}
export class SchoolDto {
  @ApiProperty() @IsString() @Length(1, 160) legalName!: string;
  @ApiProperty() @IsString() @Length(1, 100) displayName!: string;
  @ApiProperty() @IsIn(['en-IN', 'te-IN']) locale!: string;
  @ApiProperty() @IsString() @Length(1, 80) timezone!: string;
  @ApiProperty() @Matches(/^\d{4}-\d{4}$/) academicYear!: string;
  @ApiProperty() @IsString() @Length(1, 100) board!: string;
  @ApiProperty() @Matches(/^[A-Z]{2}$/) country!: string;
  @ApiProperty() @IsString() @Length(1, 100) state!: string;
  @ApiProperty() @IsString() @Length(1, 500) address!: string;
  @ApiProperty() @IsEmail() contactEmail!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  logoUrl?: string;
  @ApiProperty()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  campuses!: string[];
}
export class StatusDto {
  @ApiProperty() @IsIn(['ACTIVE', 'SUSPENDED', 'OFFBOARDED']) status!: string;
}
