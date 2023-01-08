import type { MaybeRef } from '@vueuse/core'
import type { Paginator, mastodon } from 'masto'
import type { RouteLocation } from 'vue-router'

export interface UseSearchOptions {
  type?: MaybeRef<mastodon.v2.SearchType>
}

export interface BuildSearchResult<K extends keyof any, T> {
  id: string
  type: K
  data: T
  to: RouteLocation & {
    href: string
  }
}
export type AccountSearchResult = BuildSearchResult<'account', mastodon.v1.Account>
export type HashTagSearchResult = BuildSearchResult<'hashtag', mastodon.v1.Tag>
export type StatusSearchResult = BuildSearchResult<'status', mastodon.v1.Status>

export type SearchResult = HashTagSearchResult | AccountSearchResult | StatusSearchResult

export function useSearch(query: MaybeRef<string>, options?: UseSearchOptions) {
  const done = ref(false)
  const masto = useMasto()
  const loading = ref(false)
  const accounts = ref<AccountSearchResult[]>([])
  const hashtags = ref<HashTagSearchResult[]>([])
  const statuses = ref<StatusSearchResult[]>([])

  let paginator: Paginator<mastodon.v2.Search, mastodon.v2.SearchParams> | undefined

  const appendResults = (results: mastodon.v2.Search, empty = false) => {
    if (empty) {
      accounts.value = []
      hashtags.value = []
      statuses.value = []
    }
    accounts.value = [...accounts.value, ...results.accounts.map<AccountSearchResult>(account => ({
      type: 'account',
      id: account.id,
      data: account,
      to: getAccountRoute(account),
    }))]
    hashtags.value = [...hashtags.value, ...results.hashtags.map<HashTagSearchResult>(hashtag => ({
      type: 'hashtag',
      id: `hashtag-${hashtag.name}`,
      data: hashtag,
      to: getTagRoute(hashtag.name),
    }))]
    statuses.value = [...statuses.value, ...results.statuses.map<StatusSearchResult>(status => ({
      type: 'status',
      id: status.id,
      data: status,
      to: getStatusRoute(status),
    }))]
  }

  watch(() => unref(query), () => {
    if (!unref(query) || !isMastoInitialised.value)
      return
    loading.value = true
  })

  debouncedWatch(() => unref(query), async () => {
    if (!unref(query) || !isMastoInitialised.value)
      return

    loading.value = true

    /**
     * Based on the source it seems like modifying the params when calling next would result in a new search,
     * but that doesn't seem to be the case. So instead we just create a new paginator with the new params.
     */
    paginator = masto.v2.search({
      q: unref(query),
      resolve: !!currentUser.value,
      type: unref(options?.type),
    })
    const nextResults = await paginator.next()

    done.value = !!nextResults.done
    if (!nextResults.done)
      appendResults(nextResults.value, true)

    loading.value = false
  }, { debounce: 300 })

  const next = async () => {
    if (!unref(query) || !isMastoInitialised.value || !paginator)
      return

    loading.value = true
    const nextResults = await paginator.next()
    loading.value = false

    done.value = !!nextResults.done
    if (!nextResults.done)
      appendResults(nextResults.value)
  }

  return {
    accounts,
    hashtags,
    statuses,
    loading: readonly(loading),
    next,
  }
}