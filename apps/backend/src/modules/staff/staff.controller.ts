import { Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ShopPermission as P, schemas } from '@fabnix/shared';
import { z } from 'zod';
import { AuthUser, CurrentUser, UserTypes } from '../../common/auth/auth.decorators';
import { Shop, ShopContext, ShopRoute } from '../../common/tenancy/shop-context';
import { IdParam, ZBody } from '../../common/validation/zod';
import { StaffService } from './staff.service';

@ApiTags('staff')
@ApiBearerAuth()
@Controller()
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get('shops/:shopId/roles')
  @ShopRoute(P.STAFF_VIEW)
  roles(@Shop() ctx: ShopContext) {
    return this.staff.listRoles(ctx.shopId);
  }

  @Post('shops/:shopId/roles')
  @ShopRoute(P.STAFF_MANAGE)
  createRole(@Shop() ctx: ShopContext, @ZBody(schemas.createRoleSchema) dto: z.infer<typeof schemas.createRoleSchema>) {
    return this.staff.createRole(ctx, dto);
  }

  @Patch('shops/:shopId/roles/:roleId')
  @ShopRoute(P.STAFF_MANAGE)
  updateRole(@Shop() ctx: ShopContext, @IdParam('roleId') roleId: string, @ZBody(schemas.updateRoleSchema) dto: z.infer<typeof schemas.updateRoleSchema>) {
    return this.staff.updateRole(ctx, roleId, dto);
  }

  @Get('shops/:shopId/members')
  @ShopRoute(P.STAFF_VIEW)
  members(@Shop() ctx: ShopContext) {
    return this.staff.listMembers(ctx.shopId);
  }

  @Patch('shops/:shopId/members/:memberId')
  @ShopRoute(P.STAFF_MANAGE)
  updateMember(@Shop() ctx: ShopContext, @IdParam('memberId') memberId: string, @ZBody(schemas.updateMemberSchema) dto: z.infer<typeof schemas.updateMemberSchema>) {
    return this.staff.updateMember(ctx, memberId, dto);
  }

  @Post('shops/:shopId/invitations')
  @ShopRoute(P.STAFF_MANAGE)
  invite(@Shop() ctx: ShopContext, @ZBody(schemas.inviteMemberSchema) dto: z.infer<typeof schemas.inviteMemberSchema>) {
    return this.staff.invite(ctx, dto);
  }

  @Post('invitations/accept')
  @UserTypes('SHOPKEEPER')
  accept(@CurrentUser() user: AuthUser, @ZBody(schemas.acceptInvitationSchema) dto: z.infer<typeof schemas.acceptInvitationSchema>) {
    return this.staff.accept(user, dto.token);
  }
}
