import { Alert, Button, Input, Modal, Popconfirm, Select, Space, Tag, Tooltip, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { subTaskApi } from '../api/subTask';
import { taskPhaseApi } from '../api/taskPhase';
import { StatusBadge } from '../components/common/StatusBadge';
import { UserAvatar } from '../components/common/UserAvatar';
import { useProject } from '../hooks/useProject';
import { useTaskStore } from '../stores/taskStore';
import { PhaseStatus, TaskPhase, TaskStatus } from '../types';
import { formatDuration } from '../utils/formatDuration';

const columns = [TaskStatus.Todo, TaskStatus.InProgress, TaskStatus.Review, TaskStatus.Done];

export function TaskBoard() {
  const id = Number(useParams().id || 1);
  const { project } = useProject(id);
  const { phases, tasks, loadPhases } = useTaskStore();
  const [blockingPhase, setBlockingPhase] = useState<TaskPhase | null>(null);
  const [blockReason, setBlockReason] = useState('');

  useEffect(() => {
    void loadPhases(id);
  }, [id, loadPhases]);

  const phaseOf = (phaseId: number) => phases.find((phase) => phase.id === phaseId);
  const blockedPhases = phases.filter((phase) => phase.status === PhaseStatus.Blocked);

  const moveTask = async (taskId: number, status: TaskStatus) => {
    const task = tasks.find((item) => item.id === taskId);
    const phase = task ? phaseOf(task.phaseId) : undefined;
    if (status === TaskStatus.Done && phase?.status === PhaseStatus.Blocked) {
      message.warning(`阶段「${phase.name}」阻塞中，子任务不能标记完成，请先解除阻塞`);
      return;
    }
    await subTaskApi.updateStatus(taskId, status);
    await loadPhases(id);
  };

  const confirmBlock = async () => {
    if (!blockingPhase) {
      return;
    }
    const reason = blockReason.trim();
    if (!reason) {
      message.warning('请填写阻塞原因');
      return;
    }
    await taskPhaseApi.block(blockingPhase.id, reason);
    setBlockingPhase(null);
    setBlockReason('');
    await loadPhases(id);
  };

  const cancelBlock = () => {
    setBlockingPhase(null);
    setBlockReason('');
  };

  const unblock = async (phaseId: number) => {
    await taskPhaseApi.unblock(phaseId);
    await loadPhases(id);
  };

  return (
    <>
      <div className="page-title">
        <div>
          <Typography.Title level={2}>{project?.name || '项目'} · 任务看板</Typography.Title>
          <Typography.Text type="secondary">按任务状态推进，现场负责人可直接更新流转状态</Typography.Text>
        </div>
        <Button type="primary">新增子任务</Button>
      </div>
      {blockedPhases.map((phase) => (
        <Alert
          key={phase.id}
          type="error"
          showIcon
          style={{ marginBottom: 12 }}
          message={`阶段「${phase.name}」阻塞中`}
          description={`阻塞原因：${phase.blockReason || '未填写'}`}
          action={
            <Popconfirm title="确认解除该阶段的阻塞？" onConfirm={() => void unblock(phase.id)}>
              <Button size="small">解除阻塞</Button>
            </Popconfirm>
          }
        />
      ))}
      <div className="surface" style={{ marginBottom: 16 }}>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          {phases.map((phase) => (
            <Space key={phase.id} style={{ width: '100%', justifyContent: 'space-between' }} wrap>
              <Space wrap>
                <Typography.Text strong>{phase.name}</Typography.Text>
                <StatusBadge value={phase.status} />
                <Typography.Text type="secondary">进度 {phase.percentComplete}%</Typography.Text>
                {phase.status === PhaseStatus.Blocked && phase.blockReason ? (
                  <Typography.Text type="danger">原因：{phase.blockReason}</Typography.Text>
                ) : null}
              </Space>
              {phase.status === PhaseStatus.Blocked ? (
                <Popconfirm title="确认解除该阶段的阻塞？" onConfirm={() => void unblock(phase.id)}>
                  <Button size="small">解除阻塞</Button>
                </Popconfirm>
              ) : (
                <Button size="small" danger disabled={phase.status === PhaseStatus.Completed} onClick={() => setBlockingPhase(phase)}>
                  阻塞
                </Button>
              )}
            </Space>
          ))}
        </Space>
      </div>
      <div className="board">
        {columns.map((status) => (
          <div className="board-column" key={status}>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <StatusBadge value={status} />
              <Typography.Text type="secondary">{tasks.filter((task) => task.status === status).length}</Typography.Text>
            </Space>
            {tasks
              .filter((task) => task.status === status)
              .map((task) => {
                const phase = phaseOf(task.phaseId);
                const phaseBlocked = phase?.status === PhaseStatus.Blocked;
                return (
                  <div className="task-card" key={task.id}>
                    <Typography.Text strong>{task.name}</Typography.Text>
                    <p>{task.description}</p>
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                      <Space wrap>
                        <UserAvatar name={task.owner?.name} />
                        {phaseBlocked ? (
                          <Tooltip title={phase?.blockReason ? `阻塞原因：${phase.blockReason}` : '所属阶段阻塞中'}>
                            <Tag color="error">阶段阻塞</Tag>
                          </Tooltip>
                        ) : null}
                      </Space>
                      <Typography.Text type="secondary">
                        计划 {formatDuration(task.estimatedHours)} / 实际 {formatDuration(task.actualHours)}
                      </Typography.Text>
                      <Select
                        size="small"
                        value={task.status}
                        style={{ width: '100%' }}
                        options={columns.map((item) => ({
                          value: item,
                          label: item,
                          disabled: phaseBlocked && item === TaskStatus.Done
                        }))}
                        onChange={(next) => void moveTask(task.id, next)}
                      />
                    </Space>
                  </div>
                );
              })}
          </div>
        ))}
      </div>
      <Modal
        title={`阻塞阶段「${blockingPhase?.name || ''}」`}
        open={!!blockingPhase}
        okText="确认阻塞"
        cancelText="取消"
        okButtonProps={{ disabled: !blockReason.trim() }}
        onOk={() => void confirmBlock()}
        onCancel={cancelBlock}
      >
        <Typography.Text type="secondary">请填写一句阻塞原因，会展示在任务看板上，解除阻塞后自动清除。</Typography.Text>
        <Input.TextArea
          rows={3}
          maxLength={200}
          style={{ marginTop: 8 }}
          placeholder="例如：等待设计院确认加固节点变更方案"
          value={blockReason}
          onChange={(event) => setBlockReason(event.target.value)}
        />
      </Modal>
    </>
  );
}
