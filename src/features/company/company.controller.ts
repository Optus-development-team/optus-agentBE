import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { TokenService } from '../../common/security/token.service';
import { CompanyService } from './services/company.service';
import { AddCompanyUserDto, CreateCompanyDto } from './dto/company.dto';
import type {
  CompanyOrderRecord,
  CompanyProductRecord,
  CompanySummary,
  CompanyUser,
} from './types/company.types';
import { FullCookieJwtAuthGuard } from '../auth/full-cookie-jwt-auth.guard';
import type { FullAuthenticatedRequest } from '../auth/full-cookie-jwt-auth.guard';

@ApiTags('company')
@ApiBearerAuth()
@Controller('company')
export class CompanyController {
  constructor(
    private readonly tokens: TokenService,
    private readonly companyService: CompanyService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Lista las empresas asociadas al usuario autenticado',
  })
  async listCompanies(
    @Headers('authorization') authorization: string,
  ): Promise<CompanySummary[]> {
    const { userId } = this.resolveUser(authorization);
    return this.companyService.listCompaniesForUser(userId);
  }

  @Post()
  @ApiOperation({
    summary: 'Crea una nueva empresa y asocia al usuario creador',
  })
  @ApiOkResponse({ description: 'Empresa creada' })
  async createCompany(
    @Headers('authorization') authorization: string,
    @Body() body: CreateCompanyDto,
  ): Promise<CompanySummary> {
    const { userId } = this.resolveUser(authorization);
    return this.companyService.createCompany({
      name: body.name,
      currency: body.currency,
      vertical: body.vertical,
      creatorUserId: userId,
    });
  }

  @Post(':id/users')
  @ApiOperation({ summary: 'Asocia un usuario a una empresa existente' })
  async addUser(
    @Headers('authorization') authorization: string,
    @Param('id') companyId: string,
    @Body() body: AddCompanyUserDto,
  ): Promise<{ updated: boolean }> {
    this.resolveUser(authorization);
    if (!companyId) {
      throw new BadRequestException('companyId es requerido');
    }
    return this.companyService.addUserToCompany({
      companyId,
      userId: body.userId,
      role: body.role,
    });
  }

  @Get(':id/users')
  @ApiOperation({ summary: 'Lista los usuarios asociados a una empresa' })
  async listUsers(
    @Headers('authorization') authorization: string,
    @Param('id') companyId: string,
  ): Promise<CompanyUser[]> {
    this.resolveUser(authorization);
    if (!companyId) {
      throw new BadRequestException('companyId es requerido');
    }
    return this.companyService.listCompanyUsers(companyId);
  }

  @Get('products')
  @UseGuards(FullCookieJwtAuthGuard)
  @ApiOperation({ summary: 'Lista los productos de la empresa autenticada' })
  async listProducts(
    @Req() req: FullAuthenticatedRequest,
  ): Promise<CompanyProductRecord[]> {
    const companyId = req.auth?.companyId;
    if (!companyId) {
      throw new UnauthorizedException('Empresa no autenticada');
    }

    return this.companyService.listCompanyProducts(companyId);
  }

  @Get('orders')
  @UseGuards(FullCookieJwtAuthGuard)
  @ApiOperation({ summary: 'Lista las órdenes de la empresa autenticada' })
  async listOrders(
    @Req() req: FullAuthenticatedRequest,
  ): Promise<CompanyOrderRecord[]> {
    const companyId = req.auth?.companyId;
    if (!companyId) {
      throw new UnauthorizedException('Empresa no autenticada');
    }

    return this.companyService.listCompanyOrders(companyId);
  }

  private resolveUser(authorization?: string): { userId: string } {
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Authorization header inválido');
    }
    const token = authorization.slice('Bearer '.length).trim();
    const payload = this.tokens.verifyToken(token);
    if (!payload || !payload.userId) {
      throw new UnauthorizedException('Token inválido o sin userId');
    }
    return { userId: payload.userId };
  }
}
