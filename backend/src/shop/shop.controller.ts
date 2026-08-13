import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { ShopService } from './shop.service';
import { CreateProductCategoryDto, CreateProductDto } from './dto/shop.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user.type';
import { PaginationDto } from '../common/dto/pagination.dto';

@ApiTags('Shop')
@ApiBearerAuth()
@Controller({ path: 'shop', version: '1' })
export class ShopController {
  constructor(private readonly shopService: ShopService) {}

  @Roles(RoleName.SCHOOL_ADMIN)
  @Post('categories')
  createCategory(@Body() dto: CreateProductCategoryDto, @CurrentUser() user: AuthUser) {
    return this.shopService.createCategory(dto, user);
  }

  @Roles(RoleName.SCHOOL_ADMIN)
  @Get('categories')
  listCategories(@Query() query: PaginationDto, @CurrentUser() user: AuthUser) {
    return this.shopService.listCategories(user, query);
  }

  @Roles(RoleName.SCHOOL_ADMIN)
  @Post('products')
  createProduct(@Body() dto: CreateProductDto, @CurrentUser() user: AuthUser) {
    return this.shopService.createProduct(dto, user);
  }

  @Roles(RoleName.SCHOOL_ADMIN)
  @Get('products')
  listProducts(@Query() query: PaginationDto, @CurrentUser() user: AuthUser) {
    return this.shopService.listProducts(user, query);
  }
}
