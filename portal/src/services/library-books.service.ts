import { apiClient } from "@/lib/api-client";

export type LibraryChapter = {
  id: string;
  chapterNumber: number | null;
  title: string;
  topicName: string;
  textLength: number;
  createdAt: string;
  uploadedBy: { firstName: string; lastName: string } | null;
  uploadedBySchool: { id: string; name: string } | null;
};

export type LibraryBookListItem = {
  id: string;
  title: string;
  publisher: string;
  classLabel: string;
  subjectLabel: string;
  editionYear: string | null;
  chapterCount: number;
  schoolCount: number;
  createdBy: { id: string; firstName: string; lastName: string } | null;
  originSchool: { id: string; name: string } | null;
  createdAt: string;
  chapters: LibraryChapter[];
};

export type LibraryBookDetail = LibraryBookListItem & {
  grants: Array<{
    id: string;
    schoolId: string;
    canRead: boolean;
    canWrite: boolean;
    canUpdate: boolean;
    canDelete: boolean;
    school: { id: string; name: string };
  }>;
};

export const libraryBooksService = {
  list() {
    return apiClient<LibraryBookListItem[]>("/library-books");
  },
  get(id: string) {
    return apiClient<LibraryBookDetail>(`/library-books/${id}`);
  },
  update(
    id: string,
    body: Partial<Pick<LibraryBookListItem, "title" | "publisher" | "classLabel" | "subjectLabel" | "editionYear">>,
  ) {
    return apiClient<LibraryBookListItem>(`/library-books/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  create(body: { title: string; publisher?: string; classLabel?: string; subjectLabel?: string; editionYear?: string }) {
    return apiClient<{ id: string }>("/library-books", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  grant(
    id: string,
    body: { schoolId: string; canRead: boolean; canWrite: boolean; canUpdate: boolean; canDelete: boolean },
  ) {
    return apiClient(`/library-books/${id}/grants`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  revoke(id: string, schoolId: string) {
    return apiClient(`/library-books/${id}/grants/${schoolId}`, { method: "DELETE" });
  },
  remove(id: string) {
    return apiClient(`/library-books/${id}`, { method: "DELETE" });
  },
  addChapter(
    bookId: string,
    body: { title: string; topicName?: string; publishedText: string; exercisesText?: string },
  ) {
    return apiClient(`/library-books/${bookId}/chapters`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  removeChapter(bookId: string, chapterId: string) {
    return apiClient(`/library-books/${bookId}/chapters/${chapterId}`, { method: "DELETE" });
  },
  getChapter(bookId: string, chapterId: string) {
    return apiClient<{ id: string; title: string; topicName: string; publishedText: string; exercisesText: string }>(
      `/library-books/${bookId}/chapters/${chapterId}`,
    );
  },
  replaceChapter(
    bookId: string,
    chapterId: string,
    body: { title?: string; topicName?: string; publishedText?: string; exercisesText?: string },
  ) {
    return apiClient(`/library-books/${bookId}/chapters/${chapterId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
};
