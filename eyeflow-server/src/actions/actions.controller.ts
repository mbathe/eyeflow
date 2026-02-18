import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { ActionsService, Action } from './actions.service';

@Controller('actions')
export class ActionsController {
  constructor(private readonly actionsService: ActionsService) {}

  @Post()
  createAction(@Body() data: Omit<Action, 'id' | 'createdAt'>) {
    const action = this.actionsService.createAction(data);
    return {
      success: true,
      message: 'Action created successfully',
      action,
    };
  }

  @Get()
  getAllActions() {
    const actions = this.actionsService.getAllActions();
    return {
      total: actions.length,
      actions,
    };
  }

  @Get(':id')
  getAction(@Param('id') id: string) {
    const action = this.actionsService.getAction(id);
    if (!action) {
      return { error: 'Action not found' };
    }
    return action;
  }
}
