import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskPhase } from '../models/taskPhase.entity';
import { PhaseStatus, TaskStatus } from '../types/enums';
import { AuditService } from './audit.service';

@Injectable()
export class TaskPhaseService {
  constructor(
    @InjectRepository(TaskPhase) private readonly phaseRepository: Repository<TaskPhase>,
    private readonly auditService: AuditService
  ) {}

  async findByProject(projectId: number) {
    return this.phaseRepository.find({ where: { projectId }, relations: ['subTasks'], order: { plannedStartDate: 'ASC' } });
  }

  async create(payload: Partial<TaskPhase>, actorId = 1) {
    const phase = await this.phaseRepository.save(this.phaseRepository.create(payload));
    await this.auditService.record('phase.create', 'TaskPhase', phase.id, actorId, payload);
    return phase;
  }

  async updateProgress(id: number, percentComplete: number, actorId = 1) {
    const phase = await this.phaseRepository.findOne({ where: { id }, relations: ['subTasks'] });
    if (!phase) {
      throw new NotFoundException('任务阶段不存在');
    }
    if (percentComplete >= 100) {
      if (phase.status === PhaseStatus.Blocked) {
        throw new BadRequestException('阶段处于阻塞状态，请先解除阻塞再标记完成');
      }
      const unfinished = (phase.subTasks || []).filter((task) => task.status !== TaskStatus.Done);
      if (unfinished.length > 0) {
        throw new BadRequestException(`阶段还有 ${unfinished.length} 个子任务未完成，不能将进度改为 100%`);
      }
    }
    phase.percentComplete = percentComplete;
    if (phase.status !== PhaseStatus.Blocked) {
      phase.status = percentComplete >= 100 ? PhaseStatus.Completed : PhaseStatus.InProgress;
    }
    const updated = await this.phaseRepository.save(phase);
    await this.auditService.record('phase.progress.update', 'TaskPhase', id, actorId, { percentComplete });
    return updated;
  }

  async setBlocked(id: number, blocked: boolean, reason?: string, actorId = 1) {
    const phase = await this.phaseRepository.findOne({ where: { id }, relations: ['subTasks'] });
    if (!phase) {
      throw new NotFoundException('任务阶段不存在');
    }
    if (blocked) {
      const trimmed = (reason || '').trim();
      if (!trimmed) {
        throw new BadRequestException('阻塞阶段时必须填写阻塞原因');
      }
      phase.status = PhaseStatus.Blocked;
      phase.blockReason = trimmed;
    } else {
      const tasks = phase.subTasks || [];
      const allDone = tasks.length > 0 && tasks.every((task) => task.status === TaskStatus.Done);
      phase.status = allDone || phase.percentComplete >= 100 ? PhaseStatus.Completed : PhaseStatus.InProgress;
      phase.blockReason = null;
    }
    const updated = await this.phaseRepository.save(phase);
    await this.auditService.record(blocked ? 'phase.block' : 'phase.unblock', 'TaskPhase', id, actorId, blocked ? { reason: phase.blockReason } : {});
    return updated;
  }
}
