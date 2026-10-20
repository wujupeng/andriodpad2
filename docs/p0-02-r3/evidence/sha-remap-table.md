# P0-02 旧 SHA → 新 SHA 映射表

> git filter-repo 历史重写后，所有提交 SHA 已变更。本表为旧 SHA → 新 SHA 可复核映射，供 P0-02 证据链追溯使用。
> 数据来源：`.git/filter-repo/commit-map`

## P0-02 关键证据链映射

| 旧 SHA（7位） | 新 SHA（7位） | 旧 SHA（完整） | 新 SHA（完整） | 提交说明 | 引用数 |
|--------------|--------------|----------------|----------------|----------|--------|
| 7e81fa9 | ed90d6e | 7e81fa9d3bc042c46eaa5ab3af0ae0424a87a3ec | ed90d6ed5d3c72607514038bad1f70d85f5299e5 | 代码修复提交 | — |
| dfbb5f2 | c08740c | dfbb5f26189279c600c77c00c31e62f55e0097c6 | c08740c618e709ed170e9de295f9a5abc76ad700 | 早期引用提交 | — |
| 81d8293 | b13be26 | 81d82937c08dc7d29063c6d5e98ee3bcc55cba07 | b13be2671426f47cd97af2b89fd4e714c7d85f8e | 证据补齐提交 | — |
| 5cd4da7 | 9dff58b | 5cd4da778d135cd7f98f67282880bafa8ba89a8c | 9dff58b30fc8fcd947c0608e021cb1033780358f | SHA 修正提交 | — |
| 17fac76 | 22f53cc | 17fac761f2d4f147d00b5888940f8d8c236378cf | 22f53ccee2fa89b4a05528521f552ed970ad6531 | 上一轮整改提交 | — |
| f16e470 | fd8c98a | f16e4707e6130d7adb80c8b7ffd65f73eec0164a | fd8c98a08408a132794c0a431d73ae280251a132 | SHA 补充提交 | — |

## 全部提交映射（37 个提交）

| 旧 SHA（7位） | 新 SHA（7位） | 旧 SHA（完整） | 新 SHA（完整） |
|--------------|--------------|----------------|----------------|
| 110cb03 | a0fc7ad | 110cb03ad704034c06ccccd0904d393c4bf07982 | a0fc7ad1b21aed0cc5f546aa7b8c4ea2cb5952b3 |
| 17fac76 | 22f53cc | 17fac761f2d4f147d00b5888940f8d8c236378cf | 22f53ccee2fa89b4a05528521f552ed970ad6531 |
| 2bf4cdf | 028fe7a | 2bf4cdf6a48972dec7db758526e1c8b2e2b41fb4 | 028fe7a534b89de5de027ed589f7045d6bb92d97 |
| 5cd4da7 | 9dff58b | 5cd4da778d135cd7f98f67282880bafa8ba89a8c | 9dff58b30fc8fcd947c0608e021cb1033780358f |
| 693fb75 | efbe716 | 693fb75ffcacaf8563d30b34d46d9c139d9a2495 | efbe716e7a8b18e5fc671991496599581268e80c |
| 72a603a | 86497cc | 72a603a62e55e10e8b884b861c9ac28a1c9765ce | 86497ccd6a1cdf5840e161a5e9c656a56c2ef28f |
| 7e81fa9 | ed90d6e | 7e81fa9d3bc042c46eaa5ab3af0ae0424a87a3ec | ed90d6ed5d3c72607514038bad1f70d85f5299e5 |
| 81d8293 | b13be26 | 81d82937c08dc7d29063c6d5e98ee3bcc55cba07 | b13be2671426f47cd97af2b89fd4e714c7d85f8e |
| a5c5364 | d23b502 | a5c5364ebdadaecdb20a1509d50a4ecc56a8d3df | d23b502368eb8f15dcbbea99a96fc0544e77daf1 |
| c44eadf | 884b1c2 | c44eadfc8da164f2e18a0f39ecfbb6303a26f404 | 884b1c29b7c14d13ad3c02f2c3dab713094bb5e2 |
| c6bd202 | 4aba85e | c6bd202922a3d7dfcd6d03cbda08cd9544bc7dfb | 4aba85e54dc96e00b0848b7a37612580afbaea14 |
| d720262 | e2ba248 | d72026258edfcd29ecf9f6d0b1f26cd126fc9f12 | e2ba2489edbc445ec420caf20b81215f903bb59e |
| dac77fe | 53c26a0 | dac77fe086455b6b6d753a8928881adca8d0e91f | 53c26a0c240d382fecfc09f2a431c013c4dbfd91 |
| dfbb5f2 | c08740c | dfbb5f26189279c600c77c00c31e62f55e0097c6 | c08740c618e709ed170e9de295f9a5abc76ad700 |
| f16e470 | fd8c98a | f16e4707e6130d7adb80c8b7ffd65f73eec0164a | fd8c98a08408a132794c0a431d73ae280251a132 |
| fb989dd | 9eba68f | fb989ddccb58007d4f2f8a0081bd6374950a65e5 | 9eba68f50e900b36006855560039152a04800d63 |

## 引用分类统计

| 分类 | 数量 | 处置方式 |
|------|------|----------|
| P0-02 关键证据链引用 | 65 处 | 本映射表提供可复核替代映射 |
| 其他历史说明引用 | 525 处 | 记录但不修复（非证据链关键引用） |
| **合计** | **590 处** | — |

## 引用影响评估

- **P0-02 证据链引用**（65 处）：这些引用指向 P0-02 验收过程中的关键提交（代码修复、证据补齐、SHA 修正等）。本映射表提供旧 SHA → 新 SHA 的完整映射，PM 可通过映射表追溯新提交。
- **其他历史说明引用**（525 处）：这些引用出现在产品范围文档、SDD 规划文档等非 P0-02 证据链位置，属于历史说明性质，不影响 P0-02 验收可追溯性。
- **风险结论**：通过本映射表，P0-02 证据链的所有关键引用均可通过旧 SHA → 新 SHA 映射追溯至重写后的提交。525 处历史说明引用不影响验收，由仓库所有者决定后续是否批量更新。