import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubTask } from '../models/subTask.entity';
import { TaskPhase } from '../models/taskPhase.entity';
import { PhaseStatus, TaskStatus } from '../types/enums';
import { AuditService } from './audit.service';

@Injectable()
export class SubTaskService {
  constructor(
    @InjectRepository(SubTask) private readonly taskRepository: Repository<SubTask>,
    @InjectRepository(TaskPhase) private readonly phaseRepository: Repository<TaskPhase>,
    private readonly auditService: AuditService
  ) {}

  async findByPhase(phaseId: number) {
    return this.taskRepository.find({ where: { phaseId }, order: { id: 'ASC' } });
  }

  async create(payload: Partial<SubTask>, actorId = 1) {
    const task = await this.taskRepository.save(this.taskRepository.create(payload));
    await this.auditService.record('subtask.create', 'SubTask', task.id, actorId, payload);
    return task;
  }

  async updateStatus(id: number, status: TaskStatus, actorId = 1) {
    const task = await this.taskRepository.findOneBy({ id });
    if (!task) {
      throw new NotFoundException('子任务不存在');
    }
    if (status === TaskStatus.Done) {
      const phase = await this.phaseRepository.findOneBy({ id: task.phaseId });
      if (phase?.status === PhaseStatus.Blocked) {
        throw new BadRequestException(`阶段「${phase.name}」阻塞中（${phase.blockReason || '未填写原因'}），子任务不能标记完成`);
      }
    }
    task.status = status;
    task.completedAt = status === TaskStatus.Done ? new Date().toISOString().slice(0, 10) : null;
    const updated = await this.taskRepository.save(task);
    await this.syncPhaseCompletion(task.phaseId);
    await this.auditService.record('subtask.status.update', 'SubTask', id, actorId, { status });
    return updated;
  }

  private async syncPhaseCompletion(phaseId: number) {
    const phase = await this.phaseRepository.findOne({ where: { id: phaseId }, relations: ['subTasks'] });
    if (!phase || phase.status === PhaseStatus.Blocked) {
      return;
    }
    const tasks = phase.subTasks || [];
    if (tasks.length === 0) {
      return;
    }
    const doneCount = tasks.filter((item) => item.status === TaskStatus.Done).length;
    if (doneCount === tasks.length) {
      phase.status = PhaseStatus.Completed;
      phase.percentComplete = 100;
      phase.actualEndDate = new Date().toISOString().slice(0, 10);
    } else if (phase.status === PhaseStatus.Completed || phase.percentComplete >= 100) {
      phase.status = PhaseStatus.InProgress;
      phase.percentComplete = Math.min(99, Math.round((doneCount / tasks.length) * 100));
      phase.actualEndDate = null;
    } else {
      return;
    }
    await this.phaseRepository.save(phase);
  }

  async timesheet() {
    const tasks = await this.taskRepository.find({ relations: ['owner', 'phase'] });
    const rows = tasks.reduce<Record<number, { userId: number; userName: string; plannedHours: number; actualHours: number; utilization: number }>>(
      (acc, task) => {
        const key = task.ownerId;
        acc[key] ||= { userId: task.ownerId, userName: task.owner.name, plannedHours: 0, actualHours: 0, utilization: 0 };
        acc[key].plannedHours += Number(task.estimatedHours);
        acc[key].actualHours += Number(task.actualHours);
        acc[key].utilization = acc[key].plannedHours ? Math.round((acc[key].actualHours / acc[key].plannedHours) * 100) : 0;
        return acc;
      },
      {}
    );
    return Object.values(rows);
  }
}
