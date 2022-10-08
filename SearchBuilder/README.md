# SearchBuilder
Suppose you have a list of filenames you want to select (and maybe drag&drop to send/upload them somewhere). Files are inside the same folder, but there are many other files around them. 

Microsoft Windows Explorer has strict limits on the query length, which render it useless. However, using saved search (.search-ms), we can get around the limit.

## Usage
1. Paste newline-separated filenames (from the [Filenames](https://zznidar.github.io/tools/Filenames/) tool) and the folder path. A search xml will be generated.
2. Double-click the downloaded search file
3. Enjoy with just the files you wanted :) You can now drag & drop them into WeTransfer, Drive etc.


## Sources and further reading
* https://learn.microsoft.com/en-us/windows/win32/search/-search-savedsearchfileformat
* https://answers.microsoft.com/en-us/windows/forum/all/how-do-i-use-a-windows-explorer-saved-search/42b4743b-8bb2-4e27-80d7-7f63872ffc56