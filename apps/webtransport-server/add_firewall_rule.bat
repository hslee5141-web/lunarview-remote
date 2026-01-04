@echo off
netsh advfirewall firewall add rule name="Deno WebTransport UDP" dir=in action=allow protocol=UDP localport=4433
echo Rule added successfully!
pause
