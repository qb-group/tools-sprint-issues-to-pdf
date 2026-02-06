#!/bin/bash

# Sprint Backlog에서 In Progress 상태인 이슈 목록을 markdown 테이블로 출력
# Usage: ./sprint-in-progress.sh

# 스크립트 위치 기준으로 .env 파일 로드
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"

if [[ -f "$ENV_FILE" ]]; then
  source "$ENV_FILE"
else
  echo "Error: .env 파일을 찾을 수 없습니다: $ENV_FILE" >&2
  exit 1
fi

# 환경 변수 사용 (기본값 설정)
ORG="${GITHUB_ORG:-qb-group}"
PROJECT_NUM="${GITHUB_PROJECT_ID:-3}"
STATUS="${GITHUB_PROJECT_STATUS:-In progress}"

# GraphQL로 모든 이슈 조회 (페이지네이션 처리)
all_items="[]"
has_next_page=true
end_cursor=""

echo "Fetching project items..." >&2

while [[ "$has_next_page" == "true" ]]; do
  if [[ -z "$end_cursor" ]]; then
    cursor_param=""
  else
    cursor_param=", after: \"$end_cursor\""
  fi

  page_result=$(gh api graphql -f query='
  {
    organization(login: "'"$ORG"'") {
      projectV2(number: '"$PROJECT_NUM"') {
        items(first: 100'"$cursor_param"') {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            fieldValueByName(name: "Status") {
              ... on ProjectV2ItemFieldSingleSelectValue {
                name
              }
            }
            fe: fieldValueByName(name: "FE") {
              ... on ProjectV2ItemFieldNumberValue {
                number
              }
            }
            be: fieldValueByName(name: "BE") {
              ... on ProjectV2ItemFieldNumberValue {
                number
              }
            }
            desc: fieldValueByName(name: "Desc") {
              ... on ProjectV2ItemFieldTextValue {
                text
              }
            }
            content {
              ... on Issue {
                title
                url
                state
              }
              ... on DraftIssue {
                title
              }
            }
          }
        }
      }
    }
  }')

  # 현재 페이지의 items 중 매칭되는 것만 필터링하여 추가
  # 구분자(DraftIssue)는 url이 null이지만 포함해야 함
  page_items=$(echo "$page_result" | jq --arg status "$STATUS" '
    [.data.organization.projectV2.items.nodes[] |
     select(.fieldValueByName.name == $status and
            (.content.state != "CLOSED" or .content.state == null)) | {
      title: .content.title,
      url: .content.url,
      state: .content.state,
      FE: .fe.number,
      BE: .be.number,
      Desc: .desc.text
    }]
  ')

  all_items=$(echo "$all_items" | jq ". + $page_items")

  # 다음 페이지 정보 확인
  has_next_page=$(echo "$page_result" | jq -r '.data.organization.projectV2.items.pageInfo.hasNextPage')
  end_cursor=$(echo "$page_result" | jq -r '.data.organization.projectV2.items.pageInfo.endCursor')

  page_count=$(echo "$page_items" | jq 'length')
  echo "  Fetched page, matched $page_count items, total matched: $(echo "$all_items" | jq 'length')" >&2
done

echo "Total matched items: $(echo "$all_items" | jq 'length')" >&2
echo "" >&2

# all_items는 이미 필터링된 상태
filtered="$all_items"

# Markdown 테이블 헤더 출력
echo "| # | 구분 | 이슈 | FE | BE | Desc |"
echo "|---|------|------|:--:|:--:|------|"

# 구분자 상태 추적
category=""
count=0

# 각 항목 처리
echo "$filtered" | jq -c '.[]' | while read -r item; do
  title=$(echo "$item" | jq -r '.title')
  url=$(echo "$item" | jq -r '.url')
  state=$(echo "$item" | jq -r '.state')
  fe=$(echo "$item" | jq -r '.FE')
  be=$(echo "$item" | jq -r '.BE')
  desc=$(echo "$item" | jq -r '.Desc')

  # 구분자 확인
  if [[ "$title" == *"이하 스프린트 연속"* ]]; then
    category="연속"
    continue
  elif [[ "$title" == *"이하 신규"* ]]; then
    category="신규"
    continue
  elif [[ "$title" == *"이하 기술 부채"* ]]; then
    category="부채"
    continue
  fi

  # DraftIssue(구분자) 제외 (url이 null인 경우)
  if [[ "$url" == "null" ]]; then
    continue
  fi

  # 카운터 증가
  ((count++))

  # FE, BE 값 처리 (null이면 "-"로 표시)
  [[ "$fe" == "null" ]] && fe="-"
  [[ "$be" == "null" ]] && be="-"
  [[ "$desc" == "null" ]] && desc="-"

  # Markdown 테이블 행 출력
  echo "| $count | $category | [$title]($url) | $fe | $be | $desc |"
done

# FE, BE 합계 계산 (구분자 제외, 나머지는 이미 필터링됨)
totals=$(echo "$filtered" | jq '[.[] | select(.title | test("이하 스프린트 연속|이하 신규|이하 기술 부채") | not)] | {
  count: length,
  fe_total: (map(.FE // 0) | add),
  be_total: (map(.BE // 0) | add)
}')

fe_total=$(echo "$totals" | jq -r '.fe_total')
be_total=$(echo "$totals" | jq -r '.be_total')

# 합계 행 출력
echo "| | **Total** | | **$fe_total** | **$be_total** | |"
