// 共用结构片段
import { icons } from './icons.js';

export const shell = (id, cls, body) =>
  `<section class="screen ${cls}" data-screen="${id}">${body}</section>`;

export const scroll = (body) => `<div class="screen-scroll">${body}</div>`;

export const toolbar = ({ title, back = true, right = '' }) => `
  <div class="toolbar">
    ${back ? `<button class="icon-btn small" data-action="back" aria-label="返回">${icons.back}</button>` : '<span style="width:20px"></span>'}
    <div class="toolbar-title">${title}</div>
    ${right || '<span style="width:20px"></span>'}
  </div>`;

export const sectionTitle = (t) => `<div class="section-title">${t}</div>`;

export const card = (cls, body) => `<div class="card ${cls || ''}">${body}</div>`;

export const btn = (text, cls = '', action = '') =>
  `<button class="btn ${cls}" ${action ? `data-action="${action}"` : ''}>${text}</button>`;

export const listItem = (text, action = '') =>
  `<div class="list-item" ${action ? `data-action="${action}"` : ''}><span>${text}</span><span class="text-muted">›</span></div>`;
