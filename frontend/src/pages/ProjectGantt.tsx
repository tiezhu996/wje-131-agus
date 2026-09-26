import { Button, DatePicker, Input, InputNumber, Modal, Space, Typography } from 'antd';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { taskPhaseApi } from '../api/taskPhase';
import { ProgressBar } from '../components/common/ProgressBar';
import { StatusBadge } from '../components/common/StatusBadge';
import { UserAvatar } from '../components/common/UserAvatar';
import { useProject } from '../hooks/useProject';
import { PhaseStatus, TaskPhase } from '../types';
import { formatDate } from '../utils/formatDate';

function offsetPercent(phase: TaskPhase) {
  const start = new Date(phase.plannedStartDate).getTime();
  const end = new Date(phase.plannedEndDate).getTime();
  const duration = Math.max(end - start, 1);
  const yearStart = new Date('2026-03-01').getTime();
  return {
    left: Math.max(0, Math.min(78, ((start - yearStart) / (1000 * 60 * 60 * 24 * 260)) * 100)),
    width: Math.max(10, Math.min(95, (duration / (1000 * 60 * 60 * 24 * 260)) * 100))
  };
}

export function ProjectGantt() {
  const id = Number(useParams().id || 1);
  const { project, loading, refresh } = useProject(id);
  const phases = project?.phases || [];
  const [blockTarget, setBlockTarget] = useState<TaskPhase | null>(null);
  const [blockReason, setBlockReason] = useState('');
  const [progressTarget, setProgressTarget] = useState<TaskPhase | null>(null);
  const [progressValue, setProgressValue] = useState(0);

  const openBlock = (phase: TaskPhase) => {
    setBlockTarget(phase);
    setBlockReason('');
  };

  const submitBlock = async () => {
    if (!blockTarget) {
      return;
    }
    try {
      await taskPhaseApi.block(blockTarget.id, blockReason.trim());
      setBlockTarget(null);
      setBlockReason('');
      await refresh();
    } catch {
      // 拦截器已提示错误，弹窗保持打开供修正
    }
  };

  const unblock = async (phase: TaskPhase) => {
    try {
      await taskPhaseApi.unblock(phase.id);
      await refresh();
    } catch {
      // 拦截器已提示错误
    }
  };

  const openProgress = (phase: TaskPhase) => {
    setProgressTarget(phase);
    setProgressValue(phase.percentComplete);
  };

  const submitProgress = async () => {
    if (!progressTarget) {
      return;
    }
    try {
      await taskPhaseApi.updateProgress(progressTarget.id, progressValue);
      setProgressTarget(null);
      await refresh();
    } catch {
      // 拦截器已提示错误，弹窗保持打开供修正
    }
  };

  return (
    <>
      <div className="page-title">
        <div>
          <Typography.Title level={2}>{project?.name || '项目详情'} · 甘特图</Typography.Title>
          <Typography.Text type="secondary">{project?.address || '加载中'}</Typography.Text>
        </div>
        <Space>
          <DatePicker.RangePicker />
          <Button type="primary">保存日期调整</Button>
        </Space>
      </div>
      <div className="surface">
        <Space direction="vertical" style={{ width: '100%' }} size={14}>
          <ProgressBar value={project?.progress || 0} />
          {loading ? (
            <Typography.Text>加载中...</Typography.Text>
          ) : (
            phases.map((phase) => {
              const style = offsetPercent(phase);
              const blocked = phase.status === PhaseStatus.Blocked;
              return (
                <div className="gantt-row" key={phase.id}>
                  <div>
                    <Typography.Text strong>{phase.name}</Typography.Text>
                    <br />
                    <Space>
                      <StatusBadge value={phase.status} />
                      <UserAvatar name={phase.owner?.name} />
                    </Space>
                    {blocked && (
                      <>
                        <br />
                        <Typography.Text type="danger">阻塞原因:{phase.blockedReason || '未填写'}</Typography.Text>
                      </>
                    )}
                  </div>
                  <div className="gantt-track" aria-label={`${phase.name} 时间线`}>
                    <div className="gantt-bar" style={{ left: `${style.left}%`, width: `${style.width}%` }} />
                  </div>
                  <div>
                    <Typography.Text type="secondary">{formatDate(phase.plannedStartDate)}</Typography.Text>
                    <br />
                    <Typography.Text type="secondary">{formatDate(phase.plannedEndDate)}</Typography.Text>
                  </div>
                  <div>
                    <ProgressBar value={phase.percentComplete} size="small" />
                    <Space size={8} style={{ marginTop: 6 }}>
                      <Button size="small" disabled={blocked} onClick={() => openProgress(phase)}>
                        更新进度
                      </Button>
                      {blocked ? (
                        <Button size="small" type="primary" onClick={() => void unblock(phase)}>
                          解除阻塞
                        </Button>
                      ) : (
                        <Button size="small" danger onClick={() => openBlock(phase)}>
                          阻塞
                        </Button>
                      )}
                    </Space>
                  </div>
                </div>
              );
            })
          )}
        </Space>
      </div>
      <Modal
        title={`阻塞阶段「${blockTarget?.name ?? ''}」`}
        open={!!blockTarget}
        okText="确认阻塞"
        cancelText="取消"
        okButtonProps={{ disabled: !blockReason.trim() }}
        onOk={() => void submitBlock()}
        onCancel={() => setBlockTarget(null)}
      >
        <Typography.Paragraph type="secondary">
          请填写一句阻塞原因，看板会同步展示；解除阻塞后自动清除。阻塞期间该阶段的子任务不能标记完成。
        </Typography.Paragraph>
        <Input.TextArea
          rows={3}
          maxLength={200}
          showCount
          value={blockReason}
          placeholder="例如：等待设计院确认节点变更方案"
          onChange={(event) => setBlockReason(event.target.value)}
        />
      </Modal>
      <Modal
        title={`更新进度「${progressTarget?.name ?? ''}」`}
        open={!!progressTarget}
        okText="保存"
        cancelText="取消"
        onOk={() => void submitProgress()}
        onCancel={() => setProgressTarget(null)}
      >
        <Typography.Paragraph type="secondary">
          子任务全部完成后阶段会自动完成并到 100%；仍有子任务未完成时，进度不能手工设为 100%。
        </Typography.Paragraph>
        <InputNumber
          min={0}
          max={100}
          value={progressValue}
          addonAfter="%"
          onChange={(value) => setProgressValue(Number(value ?? 0))}
        />
      </Modal>
    </>
  );
}
